import { execFile } from 'node:child_process'
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Effect, Semaphore } from 'effect'
import { serveTools } from './mcp'
import * as S from './schemas'
import type { ModelObservation, NativeToolName, Ports } from './tools'

export const modelId = 'gemini-3.8-flash-medium'
export const nativeWebTools = ['search_web', 'read_url_content'] as const
const slots = Semaphore.makeUnsafe(2)
const hookSource = fileURLToPath(new URL('./antigravity-hook.mjs', import.meta.url))

type StreamInit = {
  agent?: string
  model?: string
  tools?: unknown
}
type StreamResult = {
  status?: string
  structured_output?: { result?: unknown }
  error?: string
}
type NativeCall = Extract<ModelObservation, { kind: 'native-tool' }>

export function parseAntigravityStream(raw: string) {
  let init: StreamInit | undefined
  let result: StreamResult | undefined
  const nativeCalls: NativeCall[] = []
  for (const [index, line] of raw.split('\n').entries()) {
    if (!line.trim()) continue
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line)
    } catch (error) {
      throw new Error(`Invalid Antigravity stream event ${index + 1}: ${String(error)}`)
    }
    if (event.event === 'init') init = event.init as StreamInit
    if (event.event === 'result') result = event.result as StreamResult
    if (event.event !== 'step_update') continue
    const step = event.step_update as Record<string, unknown>
    const info = step.tool_info as Record<string, unknown> | undefined
    const name = (step.tool_name ?? info?.name) as string | undefined
    if (
      step.state === 'DONE' &&
      (nativeWebTools as readonly string[]).includes(name ?? '') &&
      info &&
      info.error === undefined
    )
      nativeCalls.push({
        kind: 'native-tool',
        name: name as NativeToolName,
        input: info.parameters,
        output: info.output,
      })
  }
  if (!init) throw new Error('Antigravity stream has no init event.')
  if (!result) throw new Error('Antigravity stream has no result event.')
  return { init, result, nativeCalls }
}

export function capabilityPolicy(request: Parameters<Ports['model']>[0]) {
  return {
    tools: ['finish', ...request.nativeTools],
    mcpTools: request.tools.map(({ name }) => name),
  }
}

export function agentDefinition(
  request: Parameters<Ports['model']>[0],
  bridge?: Awaited<ReturnType<typeof serveTools>>,
) {
  const builtins = ['finish', ...request.nativeTools]
  const mcpServers = bridge ? [{ name: 'amber', ...bridge.config }] : []
  return [
    '---',
    'name: amber',
    'description: Process the supplied Amber task.',
    `tools: ${JSON.stringify(builtins)}`,
    'mainAgent: true',
    'subagent: false',
    'inheritCustomizations: false',
    'commandExecutionPolicy: off',
    'skills: []',
    'plugins: []',
    `mcpServers: ${JSON.stringify(mcpServers)}`,
    '---',
    request.instruction,
    'Complete the task by calling finish with your actual structured result.',
    // Custom agents need the schema in their system prompt as well as CLI-side validation.
    `Your result must follow this JSON schema: ${JSON.stringify(request.outputSchema)}`,
  ].join('\n')
}

function redact(value: string, bridge?: Awaited<ReturnType<typeof serveTools>>) {
  let clean = value
  for (const secret of Object.values(bridge?.config.headers ?? {}))
    clean = clean.replaceAll(secret, '[redacted]')
  return clean.replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
}

// Official subscription transport and observable NDJSON tool events:
// https://www.antigravity.google/docs/cli/headless/
export const antigravity: Ports['model'] = (request) =>
  Effect.tryPromise({
    try: async (signal) => {
      const settings = JSON.parse(
        await readFile(join(homedir(), '.gemini/antigravity-cli/settings.json'), 'utf8'),
      )
      if (
        settings.useG1Credits === true ||
        (settings.modelProvider && settings.modelProvider !== 'antigravity')
      )
        throw new Error('Use Google OAuth and set useG1Credits=false in Antigravity settings.')
      if (request.tools.length && !settings.permissions?.allow?.includes('mcp(amber/*)'))
        throw new Error('Allow mcp(amber/*) in Antigravity settings for the PoC read tools.')
      if (
        request.nativeTools.includes('read_url_content') &&
        !settings.permissions?.allow?.includes('read_url(*)')
      )
        throw new Error('Allow read_url(*) in Antigravity settings for native public page reads.')

      const cwd = await mkdtemp(join(tmpdir(), 'amber-task-'))
      let bridge: Awaited<ReturnType<typeof serveTools>> | undefined
      try {
        bridge = request.tools.length ? await serveTools(request, signal) : undefined
        const agentDir = join(cwd, '.agents/agents/amber')
        await mkdir(agentDir, { recursive: true })
        await writeFile(
          join(cwd, '.agents/tool-policy.json'),
          JSON.stringify(capabilityPolicy(request)),
        )
        await copyFile(hookSource, join(cwd, '.agents/amber-tool-policy.mjs'))
        await writeFile(
          join(cwd, '.agents/hooks.json'),
          JSON.stringify({
            'amber-capabilities': {
              PreToolUse: [
                {
                  matcher: '*',
                  hooks: [
                    {
                      type: 'command',
                      command: `${JSON.stringify(process.execPath)} ${JSON.stringify(
                        join(cwd, '.agents/amber-tool-policy.mjs'),
                      )} ${JSON.stringify(join(cwd, '.agents/tool-policy.json'))}`,
                      timeout: 5,
                    },
                  ],
                },
              ],
            },
          }),
        )
        await writeFile(join(agentDir, 'agent.md'), agentDefinition(request, bridge))

        const env = { ...process.env }
        for (const key of [
          'GEMINI_API_KEY',
          'GOOGLE_API_KEY',
          'GOOGLE_GENAI_USE_VERTEXAI',
          'AGY_ADC_AUTH',
        ])
          delete env[key]
        const raw = await new Promise<string>((resolve, reject) => {
          execFile(
            process.env.AGY_BINARY ?? 'agy',
            [
              '--add-dir',
              cwd,
              '--agent',
              'amber',
              '--model',
              modelId,
              '--disable-slash-commands',
              '--output-format',
              'stream-json',
              '--json-schema',
              // CLI tool schemas need an object root, including when our result is a union.
              JSON.stringify({
                type: 'object',
                properties: { result: request.outputSchema },
                required: ['result'],
              }),
              '--print-timeout',
              '120s',
              '-p',
              JSON.stringify(request.input),
            ],
            {
              cwd,
              env,
              signal,
              timeout: 135_000,
              maxBuffer: 4 * 1024 * 1024,
              killSignal: 'SIGKILL',
            },
            (error, stdout, stderr) => {
              if (error)
                reject(
                  new Error(
                    `Antigravity failed: ${redact(
                      stderr.slice(-1500) || stdout.slice(0, 1500) || String(error.code),
                      bridge,
                    )}`,
                  ),
                )
              else resolve(stdout)
            },
          )
        })
        const stream = parseAntigravityStream(raw)
        if (stream.init.agent !== 'amber' || stream.init.model !== modelId)
          throw new Error('Antigravity did not select the requested agent and model.')
        const inventory = Array.isArray(stream.init.tools)
          ? stream.init.tools.filter((item): item is string => typeof item === 'string')
          : []
        await Effect.runPromise(
          request.observe({
            kind: 'configuration',
            agent: 'amber',
            model: modelId,
            declaredTools: [
              'finish',
              ...request.nativeTools,
              ...request.tools.map(({ name }) => `amber/${name}`),
            ],
            // CLI 1.1.27 reports its process-wide inventory here, not the narrower custom-agent
            // allowlist. The generated allowlist and PreToolUse deny hook control actual calls.
            runtimeInventory: inventory,
          }),
          { signal },
        )
        for (const observation of stream.nativeCalls)
          await Effect.runPromise(request.observe(observation), { signal })
        if (stream.result.status !== 'SUCCESS' || stream.result.structured_output === undefined)
          throw new Error(
            stream.result.error ??
              `Antigravity returned no structured output: ${redact(raw.slice(-2000), bridge)}`,
          )
        return stream.result.structured_output.result
      } finally {
        await bridge?.close()
        await rm(cwd, { recursive: true, force: true })
      }
    },
    catch: (error) => new S.Failure({ operation: 'antigravity', message: String(error) }),
  }).pipe(slots.withPermit)
