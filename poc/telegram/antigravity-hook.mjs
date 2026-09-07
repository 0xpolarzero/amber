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
const readUrlPermission = (() => {
  if (call.name !== 'read_url_content' || typeof call.args?.Url !== 'string') return undefined
  const hostname = new URL(call.args.Url).hostname
  const permissionHost = hostname.startsWith('www.') ? hostname.slice(4) : hostname
  return [`read_url(${hostname})`, `read_url(${permissionHost})`]
})()

process.stdout.write(
  JSON.stringify(
    direct || directMcp || lazyMcp
      ? { decision: 'allow', permissionOverrides: readUrlPermission }
      : { decision: 'deny', reason: 'This capability is not enabled for the Amber task.' },
  ),
)
