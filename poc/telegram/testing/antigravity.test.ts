import { spawn } from 'node:child_process'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { agentDefinition, capabilityPolicy, modelId, parseAntigravityStream } from '../antigravity'
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

async function runHook(call: unknown) {
  const cwd = await mkdtemp(join(tmpdir(), 'amber-hook-test-'))
  const policy = join(cwd, 'policy.json')
  await writeFile(
    policy,
    JSON.stringify({
      tools: ['finish', 'search_web', 'read_url_content'],
      mcpTools: ['searchMessages', 'readMessages', 'searchPosts'],
    }),
  )
  try {
    return await new Promise<Record<string, unknown>>((resolve, reject) => {
      const child = spawn(process.execPath, [
        new URL('../antigravity-hook.mjs', import.meta.url).pathname,
        policy,
      ])
      let stdout = ''
      let stderr = ''
      child.stdout.setEncoding('utf8').on('data', (chunk) => (stdout += chunk))
      child.stderr.setEncoding('utf8').on('data', (chunk) => (stderr += chunk))
      child.on('error', reject)
      child.on('close', (code) =>
        code === 0 ? resolve(JSON.parse(stdout)) : reject(new Error(stderr || String(code))),
      )
      child.stdin.end(JSON.stringify({ toolCall: call }))
    })
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}

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

it('parses the selected configuration and successful native web steps from NDJSON', () => {
  const raw = [
    {
      event: 'init',
      init: {
        agent: 'amber',
        model: modelId,
        tools: ['finish', 'search_web', 'read_url_content'],
      },
    },
    {
      event: 'step_update',
      step_update: {
        state: 'DONE',
        step_type: 'tool',
        tool_name: 'search_web',
        tool_info: {
          name: 'search_web',
          parameters: { query: 'IANA example domains' },
          output: 'Example Domains — https://www.iana.org/help/example-domains',
        },
      },
    },
    {
      event: 'step_update',
      step_update: {
        state: 'DONE',
        step_type: 'tool',
        tool_name: 'read_url_content',
        tool_info: {
          name: 'read_url_content',
          parameters: { Url: 'https://www.iana.org/help/example-domains' },
          output: 'IANA-managed reserved domains.',
        },
      },
    },
    {
      event: 'result',
      result: { status: 'SUCCESS', structured_output: { result: { fact: 'reserved' } } },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
  const stream = parseAntigravityStream(raw)
  expect(stream.init).toMatchObject({ agent: 'amber', model: modelId })
  expect(stream.nativeCalls.map(({ name }) => name)).toEqual(['search_web', 'read_url_content'])
  expect(
    stream.nativeCalls.flatMap(({ name, input, output }) =>
      pagesFromNativeTool(name, input, output),
    ),
  ).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ url: 'https://www.iana.org/help/example-domains' }),
    ]),
  )
})

it('does not turn failed tools, private URLs or arbitrary structured output into evidence', () => {
  expect(
    pagesFromNativeTool(
      'search_web',
      { query: 'private' },
      'http://127.0.0.1/secret and https://public.example/source',
    ),
  ).toEqual([expect.objectContaining({ url: 'https://public.example/source' })])
  expect(
    pagesFromNativeTool(
      'read_url_content',
      { Url: 'https://www.iana.org/help/example-domains' },
      undefined,
    ),
  ).toEqual([
    expect.objectContaining({
      url: 'https://www.iana.org/help/example-domains',
      text: expect.stringContaining('omitted its page body'),
    }),
  ])
  const raw = [
    { event: 'init', init: { agent: 'amber', model: modelId, tools: [] } },
    {
      event: 'step_update',
      step_update: {
        state: 'DONE',
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
      result: {
        status: 'SUCCESS',
        structured_output: { result: { source: 'https://invented.invalid' } },
      },
    },
  ]
    .map((event) => JSON.stringify(event))
    .join('\n')
  expect(parseAntigravityStream(raw).nativeCalls).toEqual([])
  expect(() => parseAntigravityStream('{not json')).toThrow('Invalid Antigravity stream event')
})

it('denies native, filesystem and foreign MCP capabilities outside the task allowlist', async () => {
  await expect(runHook({ name: 'search_web', args: { query: 'IANA' } })).resolves.toEqual({
    decision: 'allow',
  })
  await expect(
    runHook({ name: 'read_url_content', args: { Url: 'https://www.iana.org/help/' } }),
  ).resolves.toEqual({
    decision: 'allow',
    permissionOverrides: ['read_url(www.iana.org)', 'read_url(iana.org)'],
  })
  await expect(runHook({ name: 'run_command', args: {} })).resolves.toMatchObject({
    decision: 'deny',
  })
  await expect(
    runHook({
      name: 'call_mcp_tool',
      args: { server_name: 'amber', name: 'searchPosts', arguments: {} },
    }),
  ).resolves.toEqual({ decision: 'allow' })
  await expect(
    runHook({
      name: 'call_mcp_tool',
      args: { server_name: 'global-sentinel', name: 'write', arguments: {} },
    }),
  ).resolves.toMatchObject({ decision: 'deny' })
})
