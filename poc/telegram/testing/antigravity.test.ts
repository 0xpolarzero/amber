import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import {
  agentDefinition,
  capabilityPolicy,
  modelId,
  nativeCallsFromArtifactRoot,
  parseAntigravityStream,
  successfulAndFailedTools,
} from '../antigravity'
import { pagesFromNativeTool } from '../native-web'
import type { Ports } from '../tools'

const request = (overrides: Partial<Parameters<Ports['model']>[0]> = {}) =>
  ({
    task: 'post',
    instruction: 'Amber system prompt sentinel.',
    input: {},
    outputSchema: { type: 'object' },
    tools: [],
    nativeTools: [],
    callTool: () => Effect.void,
    observe: () => Effect.void,
    ...overrides,
  }) satisfies Parameters<Ports['model']>[0]

const captured = (toolOutput: string, pageContent?: string, status = 'success') => ({
  provenance: 'antigravity-cli-step-artifact-v1',
  status,
  toolOutput,
  ...(pageContent ? { pageContent } : {}),
})

it('declares only task capabilities and opts out of inherited customizations', () => {
  const selection = request()
  expect(capabilityPolicy(selection)).toEqual({ tools: ['finish'], mcpTools: [] })
  expect(agentDefinition(selection)).toContain('tools: ["finish"]')

  const writer = request({
    nativeTools: ['search_web', 'read_url_content'],
    tools: [
      { name: 'searchMessages', description: 'Search messages', inputSchema: {} },
      { name: 'readMessages', description: 'Read messages', inputSchema: {} },
      { name: 'searchPosts', description: 'Search posts', inputSchema: {} },
    ],
  })
  expect(capabilityPolicy(writer)).toEqual({
    tools: ['finish', 'search_web', 'read_url_content'],
    mcpTools: ['searchMessages', 'readMessages', 'searchPosts'],
  })
  const definition = agentDefinition(writer)
  expect(definition).toContain('inheritCustomizations: false')
  expect(definition).toContain('commandExecutionPolicy: off')
  expect(definition).toContain('skills: []')
  expect(definition).toContain('plugins: []')
  expect(definition).toContain('Amber system prompt sentinel.')
  expect(definition).not.toMatch(/run_command|view_file|invoke_subagent/)
})

it('parses completed native steps and reads their CLI artifacts', async () => {
  const raw = [
    {
      event: 'init',
      init: { agent: 'amber', model: modelId, tools: ['finish', 'search_web'] },
    },
    {
      event: 'step_update',
      step_update: {
        state: 'DONE',
        step_type: 'tool',
        step_index: 1,
        tool_name: 'search_web',
        tool_info: { name: 'search_web', parameters: { query: 'IANA example domains' } },
      },
    },
    {
      event: 'step_update',
      step_update: {
        state: 'DONE',
        step_type: 'tool',
        step_index: 2,
        tool_name: 'read_url_content',
        tool_info: {
          name: 'read_url_content',
          parameters: { Url: 'https://www.iana.org/help/example-domains' },
        },
      },
    },
    {
      event: 'result',
      result: {
        conversation_id: '11111111-1111-1111-1111-111111111111',
        status: 'SUCCESS',
        structured_output: { result: { fact: 'reserved' } },
      },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
  const artifacts = await mkdtemp(join(tmpdir(), 'amber-artifacts-test-'))
  await mkdir(join(artifacts, '1'), { recursive: true })
  await mkdir(join(artifacts, '2'), { recursive: true })
  await writeFile(
    join(artifacts, '1/output.txt'),
    'Summary with unrelated https://unrelated.example/body.\n\nSources:\n[1] [iana.org](https://www.iana.org/help/example-domains)',
  )
  await writeFile(
    join(artifacts, '2/output.txt'),
    'The full content of the article at https://www.iana.org/help/example-domains has been saved to: content.md',
  )
  await writeFile(
    join(artifacts, '2/content.md'),
    'Title: Example Domains\nSource: https://www.iana.org/help/example-domains\n\nIANA-managed reserved domains.',
  )
  try {
    const stream = parseAntigravityStream(raw)
    const nativeCalls = await nativeCallsFromArtifactRoot(artifacts, stream.nativeCalls)
    expect(nativeCalls.map(({ name }) => name)).toEqual(['search_web', 'read_url_content'])
    expect(
      nativeCalls.flatMap(({ name, input, output }) => pagesFromNativeTool(name, input, output)),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ url: 'https://www.iana.org/help/example-domains' }),
      ]),
    )
  } finally {
    await rm(artifacts, { recursive: true, force: true })
  }
})

it('accepts only successful result structures and source-specific URLs', () => {
  expect(
    pagesFromNativeTool(
      'search_web',
      { query: 'private' },
      captured(
        'Body link: https://unrelated.example/body\n\nSources:\n[1] [private](http://127.0.0.1/secret)\n[2] [credential](https://user:pass@example.com/secret)\n[3] [source](https://public.example/source)',
      ),
    ),
  ).toEqual([expect.objectContaining({ url: 'https://public.example/source' })])
  expect(pagesFromNativeTool('search_web', {}, 'https://invented.example')).toEqual([])
  expect(pagesFromNativeTool('search_web', {}, captured('https://not-a-source.example'))).toEqual(
    [],
  )
  expect(
    pagesFromNativeTool(
      'read_url_content',
      { Url: 'https://www.iana.org/help/example-domains' },
      undefined,
    ),
  ).toEqual([])
  expect(
    pagesFromNativeTool(
      'read_url_content',
      { Url: 'https://www.iana.org/help/example-domains' },
      captured(
        'The full content of the article at https://www.iana.org/help/example-domains has been saved to: content.md',
      ),
    ),
  ).toEqual([])
  expect(
    pagesFromNativeTool(
      'read_url_content',
      { Url: 'https://www.iana.org/help/example-domains' },
      captured(
        'Encountered error in step execution: fetch failed for https://www.iana.org/help/example-domains',
        'Source: https://www.iana.org/help/example-domains',
        'error',
      ),
    ),
  ).toEqual([])
})

it('keeps failed stream steps observable and rejects malformed streams', () => {
  const raw = [
    { event: 'init', init: { agent: 'amber', model: modelId, tools: [] } },
    {
      event: 'step_update',
      step_update: {
        state: 'DONE',
        step_type: 'tool',
        step_index: 1,
        tool_name: 'read_url_content',
        tool_info: {
          name: 'read_url_content',
          parameters: { Url: 'https://invented.invalid' },
          error: { message: 'fetch failed' },
        },
      },
    },
    {
      event: 'result',
      result: { status: 'SUCCESS', structured_output: { result: { source: 'invented' } } },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
  const stream = parseAntigravityStream(raw)
  expect(stream.nativeCalls).toEqual([
    expect.objectContaining({ name: 'read_url_content', stepIndex: 1, output: undefined }),
  ])
  expect(successfulAndFailedTools(stream.toolCalls)).toEqual({
    successful: [],
    failed: ['read_url_content'],
  })
  expect(() => parseAntigravityStream('{not json')).toThrow('Invalid Antigravity stream event')
})
