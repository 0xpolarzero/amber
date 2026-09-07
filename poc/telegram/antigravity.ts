import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect, Semaphore } from 'effect'
import { type McpTools, serveTools } from './mcp'
import { fetchedPageFromNativeTool } from './native-web'
import * as S from './schemas'
import type { NativeToolName, Ports } from './tools'

export const modelId = 'gemini-3.8-flash-medium'
export const nativeWebTools = ['search_web', 'read_url_content'] as const
export const inheritanceSentinel = 'AMBER_WORKSPACE_RULE_SENTINEL_7F3C91'
const slots = Semaphore.makeUnsafe(2)

type StreamInit = {
  agent?: string
  model?: string
  tools?: unknown
}
type StreamResult = {
  conversation_id?: string
  status?: string
  structured_output?: { result?: unknown }
  error?: string
}
type ToolStep = {
  name: string
  input: unknown
  output: unknown
  error: unknown
  stepIndex: number
}
type NativeStep = ToolStep & { name: NativeToolName }

function completedToolStep(event: Record<string, unknown>) {
  if (event.event !== 'step_update') return undefined
  const step = event.step_update as Record<string, unknown>
  const info = step.tool_info as Record<string, unknown> | undefined
  const name = (step.tool_name ?? info?.name) as string | undefined
  if (step.state !== 'DONE' || step.step_type !== 'tool' || !name || !info) return undefined
  return {
    name,
    input: info.parameters,
    output: info.output,
    error: info.error,
    stepIndex: Number(step.step_index),
  } satisfies ToolStep
}

export class AntigravityStreamParser {
  private pending = ''
  private lineNumber = 0
  private init: StreamInit | undefined
  private result: StreamResult | undefined
  private readonly toolCalls: ToolStep[] = []
  private readonly nativeCalls: NativeStep[] = []

  constructor(private readonly observeEvent?: (event: Record<string, unknown>) => void) {}

  push(chunk: string) {
    this.pending += chunk
    let newline = this.pending.indexOf('\n')
    while (newline !== -1) {
      this.readLine(this.pending.slice(0, newline))
      this.pending = this.pending.slice(newline + 1)
      newline = this.pending.indexOf('\n')
    }
  }

  finish() {
    if (this.pending) this.readLine(this.pending)
    this.pending = ''
    if (!this.init) throw new Error('Antigravity stream has no init event.')
    if (!this.result) throw new Error('Antigravity stream has no result event.')
    return {
      init: this.init,
      result: this.result,
      toolCalls: this.toolCalls,
      nativeCalls: this.nativeCalls,
    }
  }

  private readLine(line: string) {
    this.lineNumber += 1
    if (!line.trim()) return
    let event: Record<string, unknown>
    try {
      event = JSON.parse(line)
    } catch (error) {
      throw new Error(`Invalid Antigravity stream event ${this.lineNumber}: ${String(error)}`)
    }
    this.observeEvent?.(event)
    if (event.event === 'init') this.init = event.init as StreamInit
    if (event.event === 'result') this.result = event.result as StreamResult
    const call = completedToolStep(event)
    if (!call) return
    this.toolCalls.push(call)
    if ((nativeWebTools as readonly string[]).includes(call.name))
      this.nativeCalls.push(call as NativeStep)
  }
}

export function parseAntigravityStream(raw: string) {
  const parser = new AntigravityStreamParser()
  parser.push(raw)
  return parser.finish()
}

async function optionalFile(path: string) {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}

export async function nativeCallsFromArtifacts(
  conversationId: string,
  steps: readonly NativeStep[],
) {
  if (!steps.length) return []
  if (!isConversationId(conversationId))
    throw new Error('Antigravity returned an invalid conversation ID.')
  const root = artifactRoot(conversationId)
  return nativeCallsFromArtifactRoot(root, steps)
}

function isConversationId(value: string) {
  return /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
}

function artifactRoot(conversationId: string) {
  return join(homedir(), '.gemini/antigravity-cli/brain', conversationId, '.system_generated/steps')
}

export async function nativeCallsFromArtifactRoot(root: string, steps: readonly NativeStep[]) {
  return Promise.all(
    steps.map(async (step) => {
      if (!Number.isSafeInteger(step.stepIndex) || step.stepIndex < 0)
        throw new Error('Antigravity returned an invalid native tool step index.')
      const directory = join(root, String(step.stepIndex))
      const artifactOutput = await optionalFile(join(directory, 'output.txt'))
      const toolOutput =
        typeof step.output === 'string' && step.output.trim() ? step.output : artifactOutput
      const pageContent = await optionalFile(join(directory, 'content.md'))
      const failed =
        step.error !== undefined ||
        !toolOutput.trim() ||
        /^Encountered error in step execution:/i.test(toolOutput)
      return {
        kind: 'native-tool' as const,
        name: step.name,
        input: step.input,
        output: {
          provenance: 'antigravity-cli-step-artifact-v1',
          status: failed ? ('error' as const) : ('success' as const),
          toolOutput,
          ...(pageContent ? { pageContent } : {}),
          ...(step.error !== undefined ? { error: 'native tool failed' } : {}),
        },
      }
    }),
  )
}

export const readFetchedPageTool = {
  name: 'readFetchedPage',
  description:
    'Read bounded text from a URL already completed by read_url_content in this task. Use the returned nextOffset to continue; this tool cannot fetch URLs or read files.',
  inputSchema: {
    type: 'object',
    properties: {
      url: { type: 'string', minLength: 1, maxLength: 2_000 },
      offset: { type: 'integer', minimum: 0, maximum: 1_000_000 },
      maxChars: { type: 'integer', minimum: 1, maximum: 6_000 },
    },
    required: ['url'],
    additionalProperties: false,
  },
} as const

const readerChunkLimit = 6_000
const readerTaskBudget = 24_000

function conversationIdFromEvent(event: Record<string, unknown>) {
  const nested = [event.init, event.step_update, event.result].filter(
    (value): value is Record<string, unknown> => Boolean(value && typeof value === 'object'),
  )
  const candidates = [
    event.conversation_id,
    ...nested.map((value) => value.conversation_id),
  ].filter((value): value is unknown => value !== undefined)
  if (!candidates.length) return undefined
  if (candidates.some((value) => typeof value !== 'string' || !isConversationId(value)))
    throw new Error('Antigravity stream exposed an invalid conversation ID.')
  const ids = [...new Set(candidates as string[])]
  if (ids.length !== 1) throw new Error('Antigravity stream mixed conversation IDs.')
  return ids[0]
}

export class FetchedPageReader {
  private conversationId: string | undefined
  private readonly completed = new Map<string, NativeStep>()
  private charactersRead = 0

  constructor(
    private readonly rootForConversation: (conversationId: string) => string = artifactRoot,
  ) {}

  observeEvent(event: Record<string, unknown>) {
    const conversationId = conversationIdFromEvent(event)
    if (conversationId) {
      if (this.conversationId && this.conversationId !== conversationId)
        throw new Error('Antigravity stream changed conversation IDs.')
      this.conversationId = conversationId
    }
    const step = completedToolStep(event)
    if (step?.name !== 'read_url_content') return
    if (!this.conversationId)
      throw new Error('Completed native fetch has no validated conversation ID.')
    if (!Number.isSafeInteger(step.stepIndex) || step.stepIndex < 0)
      throw new Error('Antigravity returned an invalid native tool step index.')
    if (!step.input || typeof step.input !== 'object') return
    const url = Reflect.get(step.input, 'Url')
    if (typeof url !== 'string') return
    let href: string
    try {
      href = new URL(url).href
    } catch {
      return
    }
    this.completed.set(href, step as NativeStep)
  }

  async read(input: unknown) {
    if (!input || typeof input !== 'object' || Array.isArray(input))
      throw new Error('readFetchedPage requires an object input.')
    const record = input as Record<string, unknown>
    if (Object.keys(record).some((key) => !['url', 'offset', 'maxChars'].includes(key)))
      throw new Error('readFetchedPage received an unsupported input field.')
    if (typeof record.url !== 'string' || record.url.length > 2_000)
      throw new Error('readFetchedPage requires a bounded URL.')
    let href: string
    try {
      href = new URL(record.url).href
    } catch {
      throw new Error('readFetchedPage requires a valid fetched URL.')
    }
    const offset = record.offset ?? 0
    const maxChars = record.maxChars ?? readerChunkLimit
    if (!Number.isSafeInteger(offset) || Number(offset) < 0 || Number(offset) > 1_000_000)
      throw new Error('readFetchedPage received an invalid offset.')
    if (
      !Number.isSafeInteger(maxChars) ||
      Number(maxChars) < 1 ||
      Number(maxChars) > readerChunkLimit
    )
      throw new Error('readFetchedPage received an invalid chunk size.')
    if (this.charactersRead + Number(maxChars) > readerTaskBudget)
      throw new Error('readFetchedPage task read budget is exhausted.')
    if (!this.conversationId) throw new Error('No current Antigravity conversation is available.')
    const step = this.completed.get(href)
    if (!step) throw new Error('The URL was not successfully fetched in this task.')
    const [observation] = await nativeCallsFromArtifactRoot(
      this.rootForConversation(this.conversationId),
      [step],
    )
    const page = fetchedPageFromNativeTool(observation.input, observation.output)
    if (!page || new URL(page.url).href !== href)
      throw new Error('The fetched page artifact is missing, failed, or does not match the URL.')
    if (Number(offset) >= page.text.length)
      throw new Error('readFetchedPage offset is outside the fetched body.')
    const text = page.text.slice(Number(offset), Number(offset) + Number(maxChars))
    this.charactersRead += text.length
    const end = Number(offset) + text.length
    return {
      url: page.url,
      text,
      ...(end < page.text.length ? { nextOffset: end } : {}),
    }
  }
}

export function antigravityMcpTools(
  request: Parameters<Ports['model']>[0],
  reader: FetchedPageReader,
): McpTools {
  const readerEnabled = request.nativeTools.includes('read_url_content')
  return {
    tools: [...request.tools, ...(readerEnabled ? [readFetchedPageTool] : [])],
    callTool: (name, input) => {
      if (name !== readFetchedPageTool.name) return request.callTool(name, input)
      if (!readerEnabled)
        return Effect.fail(
          new S.Failure({ operation: 'read-fetched-page', message: 'Tool is unavailable.' }),
        )
      return Effect.tryPromise({
        try: () => reader.read(input),
        catch: (error) => new S.Failure({ operation: 'read-fetched-page', message: String(error) }),
      })
    },
  }
}

function observedToolName(step: ToolStep) {
  if (step.name !== 'call_mcp_tool' || !step.input || typeof step.input !== 'object')
    return step.name
  const server = Reflect.get(step.input, 'ServerName') ?? Reflect.get(step.input, 'server_name')
  const tool = Reflect.get(step.input, 'ToolName') ?? Reflect.get(step.input, 'name')
  return typeof server === 'string' && typeof tool === 'string' ? `${server}/${tool}` : step.name
}

export function successfulAndFailedTools(steps: readonly ToolStep[]) {
  const successful: string[] = []
  const failed: string[] = []
  for (const step of steps)
    (step.error === undefined ? successful : failed).push(observedToolName(step))
  return { successful, failed }
}

export function capabilityPolicy(request: Parameters<Ports['model']>[0]) {
  return {
    tools: ['finish', ...request.nativeTools],
    mcpTools: [
      ...request.tools.map(({ name }) => name),
      ...(request.nativeTools.includes('read_url_content') ? [readFetchedPageTool.name] : []),
    ],
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

async function runAntigravityCli(
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  signal: AbortSignal,
  parser: AntigravityStreamParser,
  bridge?: Awaited<ReturnType<typeof serveTools>>,
) {
  const maximumOutputBytes = 4 * 1024 * 1024
  return new Promise<string>((resolve, reject) => {
    const child = spawn(process.env.AGY_BINARY ?? 'agy', args, {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    child.stdout.setEncoding('utf8')
    child.stderr.setEncoding('utf8')
    let stdout = ''
    let stderr = ''
    let stdoutBytes = 0
    let stderrBytes = 0
    let failure: Error | undefined
    let aborted: Error | undefined
    let timedOut = false
    const stop = (error: Error) => {
      if (!failure) failure = error
      child.kill('SIGKILL')
    }
    const timeout = setTimeout(() => {
      timedOut = true
      child.kill('SIGKILL')
    }, 135_000)
    const abort = () => {
      aborted =
        signal.reason instanceof Error ? signal.reason : new Error('Antigravity request aborted.')
      child.kill('SIGKILL')
    }
    signal.addEventListener('abort', abort, { once: true })
    if (signal.aborted) abort()

    child.stdout.on('data', (chunk: string) => {
      if (failure) return
      stdoutBytes += Buffer.byteLength(chunk)
      if (stdoutBytes > maximumOutputBytes) {
        stop(new Error('Antigravity stdout exceeded the 4 MiB limit.'))
        return
      }
      stdout += chunk
      try {
        parser.push(chunk)
      } catch (error) {
        stop(error instanceof Error ? error : new Error(String(error)))
      }
    })
    child.stderr.on('data', (chunk: string) => {
      if (failure) return
      stderrBytes += Buffer.byteLength(chunk)
      if (stderrBytes > maximumOutputBytes) {
        stop(new Error('Antigravity stderr exceeded the 4 MiB limit.'))
        return
      }
      stderr += chunk
    })
    child.once('error', (error) => {
      failure = error
    })
    child.once('close', (code) => {
      clearTimeout(timeout)
      signal.removeEventListener('abort', abort)
      if (failure) {
        reject(failure)
        return
      }
      if (aborted) {
        reject(aborted)
        return
      }
      if (timedOut) {
        reject(new Error('Antigravity timed out after 135 seconds.'))
        return
      }
      if (code !== 0) {
        reject(
          new Error(
            `Antigravity failed: ${redact(
              stderr.slice(-1500) || stdout.slice(0, 1500) || String(code),
              bridge,
            )}`,
          ),
        )
        return
      }
      resolve(stdout)
    })
  })
}

// Official stream schema and artifact-directory contract:
// https://www.antigravity.google/docs/cli/headless/
// https://www.antigravity.google/docs/hooks/
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
      if (
        (request.tools.length || request.nativeTools.includes('read_url_content')) &&
        !settings.permissions?.allow?.includes('mcp(amber/*)')
      )
        throw new Error('Allow mcp(amber/*) in Antigravity settings for the scoped Amber tools.')
      if (
        request.nativeTools.includes('read_url_content') &&
        !settings.permissions?.allow?.includes('read_url(*)')
      )
        throw new Error('Allow read_url(*) in Antigravity settings for native public page reads.')

      const cwd = await mkdtemp(join(tmpdir(), 'amber-task-'))
      let bridge: Awaited<ReturnType<typeof serveTools>> | undefined
      try {
        const reader = new FetchedPageReader()
        const mcpTools = antigravityMcpTools(request, reader)
        bridge = mcpTools.tools.length ? await serveTools(mcpTools, signal) : undefined
        const agentDir = join(cwd, '.agents/agents/amber')
        await mkdir(agentDir, { recursive: true })
        await writeFile(
          join(cwd, 'AGENTS.md'),
          `If this rule is active, return the exact marker ${inheritanceSentinel} in any inheritedMarker field.\n`,
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
        const parser = new AntigravityStreamParser((event) => reader.observeEvent(event))
        const raw = await runAntigravityCli(
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
          cwd,
          env,
          signal,
          parser,
          bridge,
        )
        const stream = parser.finish()
        if (stream.init.agent !== 'amber' || stream.init.model !== modelId)
          throw new Error('Antigravity did not select the requested agent and model.')
        const nativeCalls = await nativeCallsFromArtifacts(
          stream.result.conversation_id ?? '',
          stream.nativeCalls,
        )
        const inventory = Array.isArray(stream.init.tools)
          ? stream.init.tools.filter((item): item is string => typeof item === 'string')
          : []
        const observed = successfulAndFailedTools(stream.toolCalls)
        await Effect.runPromise(
          request.observe({
            kind: 'configuration',
            agent: 'amber',
            model: modelId,
            declaredTools: [
              'finish',
              ...request.nativeTools,
              ...request.tools.map(({ name }) => `amber/${name}`),
              ...(request.nativeTools.includes('read_url_content')
                ? [`amber/${readFetchedPageTool.name}`]
                : []),
            ],
            // The init inventory is process-wide. Declared tools are configuration; observed
            // tools are completed NDJSON steps, not proof of the complete model-visible prompt.
            runtimeInventory: inventory,
            observedTools: observed.successful,
            failedTools: observed.failed,
            controlProvenance: 'antigravity-stream-json-v1',
          }),
          { signal },
        )
        for (const observation of nativeCalls)
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
