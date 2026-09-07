import { readFile } from 'node:fs/promises'

const policy = JSON.parse(await readFile(process.argv[2], 'utf8'))
const input = JSON.parse(
  await new Promise((resolve) => {
    let value = ''
    process.stdin.setEncoding('utf8')
    process.stdin.on('data', (chunk) => (value += chunk))
    process.stdin.on('end', () => resolve(value))
  }),
)
const call = input.toolCall ?? {}
const direct = policy.tools.includes(call.name)
const directMcp = policy.mcpTools.includes(call.name)
const lazyMcp =
  call.name === 'call_mcp_tool' &&
  (call.args?.server_name ?? call.args?.serverName) === 'amber' &&
  policy.mcpTools.includes(call.args?.name)

process.stdout.write(
  JSON.stringify(
    direct || directMcp || lazyMcp
      ? { decision: 'allow' }
      : { decision: 'deny', reason: 'This capability is not enabled for the Amber task.' },
  ),
)
