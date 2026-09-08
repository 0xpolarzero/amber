import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { Effect, Schema } from 'effect'
import { expect, it } from 'vitest'
import { serveTools } from '../../shared/mcp'
import { createModelTasks, jsonSchema } from '../model'
import * as S from '../schemas'
import type { Ports } from '../tools'

it('carries a scoped read over native MCP and rejects an unauthenticated request', async () => {
  const calls: unknown[] = []
  const bridge = await serveTools(
    {
      tools: [
        {
          name: 'searchPosts',
          description: 'Search owned posts',
          inputSchema: jsonSchema(Schema.Struct({ query: Schema.String })),
        },
      ],
      callTool: (name, input) =>
        Effect.sync(() => {
          calls.push({ name, input })
          return [{ id: 'owned-post' }]
        }),
    },
    new AbortController().signal,
  )
  const client = new Client({ name: 'test', version: '1' })
  try {
    const denied = await fetch(bridge.config.serverUrl, { method: 'POST', body: '{}' })
    expect(denied.status).toBe(401)
    await client.connect(
      new StreamableHTTPClientTransport(new URL(bridge.config.serverUrl), {
        requestInit: { headers: bridge.config.headers },
      }),
    )
    const { tools } = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0].inputSchema).toMatchObject({ type: 'object', required: ['query'] })
    expect(
      (await client.callTool({ name: 'searchPosts', arguments: { query: 'Noted' } })).content,
    ).toEqual([{ type: 'text', text: '[{"id":"owned-post"}]' }])
    expect(calls).toEqual([{ name: 'searchPosts', input: { query: 'Noted' } }])
  } finally {
    await client.close()
    await bridge.close()
  }
})

it('supplies valid provider schemas and rejects tools outside the task allowlist', async () => {
  let invoked = false
  const model: Ports['model'] = (request) =>
    Effect.gen(function* () {
      expect(request.outputSchema).toMatchObject({
        type: 'object',
        required: ['candidates', 'ignored'],
      })
      expect(request.outputSchema).not.toHaveProperty('schema')
      return yield* request.callTool('readPage', { url: 'https://example.com' })
    })
  const tasks = createModelTasks({
    model,
    readTool: () =>
      Effect.sync(() => {
        invoked = true
      }),
    progress: () => Effect.void,
  })
  await expect(
    Effect.runPromise(tasks.generate(S.Selection, 'selection', '', {}, {})),
  ).rejects.toThrow('Tool is unavailable')
  expect(invoked).toBe(false)
})
