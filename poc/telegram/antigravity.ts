import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect, Schema, Semaphore } from 'effect'
import { serveTools } from './mcp'
import * as S from './schemas'
import type { Ports } from './tools'

export const modelId = 'gemini-3.8-flash-medium'
const slots = Semaphore.makeUnsafe(2)
const Reply = Schema.Struct({
  status: Schema.String,
  structured_output: Schema.optional(Schema.Struct({ result: Schema.Unknown })),
  error: Schema.optional(Schema.String),
})

// Official subscription transport: https://antigravity.google/docs/cli/headless/
// A fresh CLI conversation and temporary workspace for every task; no API-key fallback.
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

      const cwd = await mkdtemp(join(tmpdir(), 'amber-task-'))
      const bridge = await serveTools(request, signal)
      try {
        const agentDir = join(cwd, '.agents/agents/amber')
        await mkdir(agentDir, { recursive: true })
        await writeFile(
          join(cwd, '.agents/mcp_config.json'),
          JSON.stringify({ mcpServers: { amber: bridge.config } }),
        )
        await writeFile(
          join(agentDir, 'agent.md'),
          [
            '---',
            'name: amber',
            'description: Process the supplied Amber task.',
            // finish is the CLI's structured-output tool, required even for a tool-free task.
            'tools: [finish]',
            'mainAgent: true',
            'subagent: false',
            'commandExecutionPolicy: off',
            '---',
            request.instruction,
            'Complete the task by calling finish with your actual structured result.',
            // Custom agents need the schema in their prompt as well as CLI-side validation.
            `Your result must follow this JSON schema: ${JSON.stringify(request.outputSchema)}`,
          ].join('\n'),
        )
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
              'json',
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
            { cwd, env, signal, timeout: 135_000, maxBuffer: 1024 * 1024, killSignal: 'SIGKILL' },
            (error, stdout, stderr) => {
              if (error)
                reject(
                  new Error(
                    `Antigravity failed: ${stderr.slice(-1500) || stdout.slice(0, 1500) || error.code}`,
                  ),
                )
              else resolve(stdout)
            },
          )
        })
        const reply = Schema.decodeUnknownSync(Reply)(JSON.parse(raw))
        if (reply.status !== 'SUCCESS' || reply.structured_output === undefined)
          throw new Error(
            reply.error ?? `Antigravity returned no structured output: ${raw.slice(0, 2000)}`,
          )
        return reply.structured_output.result
      } finally {
        await bridge.close()
        await rm(cwd, { recursive: true, force: true })
      }
    },
    catch: (error) => new S.Failure({ operation: 'antigravity', message: String(error) }),
  }).pipe(slots.withPermit)
