import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import {
  AntigravityStreamParser,
  antigravityMcpTools,
  FetchedPageReader,
  modelId,
  readFetchedPageTool,
} from '../../shared/antigravity'
import type { Ports } from '../tools'

const conversationId = '11111111-1111-1111-1111-111111111111'
const otherConversationId = '22222222-2222-2222-2222-222222222222'
const url = 'https://public.example/article?id=current'

const request = (nativeTools: Parameters<Ports['model']>[0]['nativeTools']) =>
  ({
    task: 'test',
    instruction: '',
    input: {},
    outputSchema: {},
    tools: [],
    nativeTools,
    callTool: () => Effect.die(new Error('No database tool expected.')),
    observe: () => Effect.void,
  }) satisfies Parameters<Ports['model']>[0]

const fetchEvent = (options: { stepIndex?: number; error?: unknown } = {}) => ({
  event: 'step_update',
  conversation_id: conversationId,
  step_update: {
    state: 'DONE',
    step_type: 'tool',
    step_index: options.stepIndex ?? 7,
    tool_name: 'read_url_content',
    tool_info: {
      name: 'read_url_content',
      parameters: { Url: url },
      ...(options.error === undefined ? {} : { error: options.error }),
    },
  },
})

async function writeFetchArtifacts(root: string, stepIndex: number, body?: string) {
  const directory = join(root, String(stepIndex))
  await mkdir(directory, { recursive: true })
  await writeFile(
    join(directory, 'output.txt'),
    `The full content of the article at ${url} has been saved to: content.md`,
  )
  if (body !== undefined) await writeFile(join(directory, 'content.md'), body)
}

it('parses NDJSON split across arbitrary chunk and line boundaries', () => {
  const raw = [
    {
      event: 'init',
      conversation_id: conversationId,
      init: { agent: 'amber', model: modelId, tools: ['finish', 'read_url_content'] },
    },
    fetchEvent(),
    {
      event: 'result',
      result: {
        conversation_id: conversationId,
        status: 'SUCCESS',
        structured_output: { result: { body: 'read' } },
      },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
  const events: Record<string, unknown>[] = []
  const parser = new AntigravityStreamParser((event) => events.push(event))
  let start = 0
  for (const boundary of [1, 9, 31, 64, 131, raw.length]) {
    parser.push(raw.slice(start, boundary))
    start = boundary
  }
  const stream = parser.finish()
  expect(events).toHaveLength(3)
  expect(stream.nativeCalls).toEqual([
    expect.objectContaining({ name: 'read_url_content', stepIndex: 7 }),
  ])
  expect(stream.result.structured_output).toEqual({ result: { body: 'read' } })
})

it('reads only the current completed fetch with bounded continuation chunks', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amber-reader-test-'))
  const pageContent = `Title: Current article\nSource: ${url}\n\n${'body-'.repeat(2_000)}`
  await writeFetchArtifacts(root, 7, pageContent)
  const reader = new FetchedPageReader(() => root)
  const parser = new AntigravityStreamParser((event) => reader.observeEvent(event))
  const events = [
    {
      event: 'init',
      conversation_id: conversationId,
      init: { agent: 'amber', model: modelId },
    },
    fetchEvent(),
    {
      event: 'result',
      result: { conversation_id: conversationId, status: 'SUCCESS', structured_output: {} },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
  try {
    for (const chunk of [events.slice(0, 17), events.slice(17, 113), events.slice(113)])
      parser.push(chunk)
    parser.finish()
    const first = await reader.read({ url, maxChars: 80 })
    expect(first).toEqual({ url, text: pageContent.slice(0, 80), nextOffset: 80 })
    const second = await reader.read({ url, offset: first.nextOffset, maxChars: 40 })
    expect(second.text).toBe(pageContent.slice(80, 120))
    await expect(reader.read({ url: 'https://public.example/not-fetched' })).rejects.toThrow(
      'not successfully fetched',
    )
    await expect(reader.read({ url, offset: -1 })).rejects.toThrow('invalid offset')
    await expect(reader.read({ url, maxChars: 6_001 })).rejects.toThrow('invalid chunk size')
    await expect(reader.read({ url, path: '../../other-task/content.md' })).rejects.toThrow(
      'unsupported input field',
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('fails closed for another conversation, failed fetches, and missing bodies', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amber-reader-failure-test-'))
  try {
    const mixed = new FetchedPageReader(() => root)
    mixed.observeEvent({ event: 'init', conversation_id: conversationId, init: {} })
    expect(() =>
      mixed.observeEvent({ event: 'step_update', conversation_id: otherConversationId }),
    ).toThrow('changed conversation IDs')

    await writeFetchArtifacts(root, 8, `Title: Failed\nSource: ${url}\n\nshould stay hidden`)
    const failed = new FetchedPageReader(() => root)
    failed.observeEvent({ event: 'init', conversation_id: conversationId, init: {} })
    failed.observeEvent(fetchEvent({ stepIndex: 8, error: { message: 'fetch failed' } }))
    await expect(failed.read({ url })).rejects.toThrow('missing, failed, or does not match')

    await writeFetchArtifacts(root, 9)
    const missing = new FetchedPageReader(() => root)
    missing.observeEvent({ event: 'init', conversation_id: conversationId, init: {} })
    missing.observeEvent(fetchEvent({ stepIndex: 9 }))
    await expect(missing.read({ url })).rejects.toThrow('missing, failed, or does not match')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

it('exposes the reader only with native fetch and enforces its task read budget', async () => {
  const root = await mkdtemp(join(tmpdir(), 'amber-reader-budget-test-'))
  const pageContent = `Title: Budget\nSource: ${url}\n\n${'x'.repeat(30_000)}`
  await writeFetchArtifacts(root, 7, pageContent)
  const reader = new FetchedPageReader(() => root)
  reader.observeEvent({ event: 'init', conversation_id: conversationId, init: {} })
  reader.observeEvent(fetchEvent())
  try {
    const selection = antigravityMcpTools(request([]), reader)
    expect(selection.tools).toEqual([])
    await expect(
      Effect.runPromise(selection.callTool(readFetchedPageTool.name, { url })),
    ).rejects.toThrow('Tool is unavailable')

    const writer = antigravityMcpTools(request(['read_url_content']), reader)
    expect(writer.tools.map(({ name }) => name)).toEqual([readFetchedPageTool.name])
    for (const offset of [0, 6_000, 12_000, 18_000])
      await Effect.runPromise(
        writer.callTool(readFetchedPageTool.name, { url, offset, maxChars: 6_000 }),
      )
    await expect(
      Effect.runPromise(
        writer.callTool(readFetchedPageTool.name, { url, offset: 24_000, maxChars: 1 }),
      ),
    ).rejects.toThrow('read budget is exhausted')
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
