import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type Tool,
} from '@modelcontextprotocol/sdk/types.js'
import { Effect } from 'effect'
import type { Run } from './tools'

export type McpTools = {
  tools: readonly {
    name: string
    description: string
    inputSchema: unknown
  }[]
  callTool: (name: string, input: unknown) => Run<unknown>
}

// One private, temporary MCP endpoint per task. The closure retains the task's scope.
export async function serveTools(request: McpTools, signal: AbortSignal) {
  const token = randomUUID()
  const clients = new Set<Server>()
  const http = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${token}`) {
      res.writeHead(401).end()
      return
    }
    if (req.method !== 'POST' || req.url !== '/mcp') {
      res.writeHead(405).end()
      return
    }
    const server = new Server({ name: 'amber', version: '1' }, { capabilities: { tools: {} } })
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    })
    clients.add(server)
    res.on('close', () => {
      clients.delete(server)
      void server.close()
    })
    server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: request.tools.map(({ inputSchema, ...tool }) => ({
        ...tool,
        inputSchema: inputSchema as Tool['inputSchema'],
        annotations: { readOnlyHint: true, destructiveHint: false },
      })),
    }))
    server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
      const result = await Effect.runPromise(request.callTool(params.name, params.arguments), {
        signal,
      })
      return { content: [{ type: 'text', text: JSON.stringify(result) }] }
    })
    try {
      await server.connect(transport)
      await transport.handleRequest(req, res)
    } catch {
      if (!res.headersSent) res.writeHead(500)
      res.end()
    }
  })
  await new Promise<void>((resolve, reject) => {
    http.once('error', reject)
    http.listen(0, '127.0.0.1', resolve)
  })
  const address = http.address()
  if (!address || typeof address === 'string') throw new Error('MCP did not bind a TCP port')
  return {
    config: {
      serverUrl: `http://127.0.0.1:${address.port}/mcp`,
      headers: { Authorization: `Bearer ${token}` },
    },
    async close() {
      http.closeAllConnections()
      await Promise.all([...clients].map((client) => client.close()))
      await new Promise<void>((resolve) => http.close(() => resolve()))
    },
  }
}
