import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { Api, TelegramClient, utils } from 'telegram'
import { StringSession } from 'telegram/sessions/index.js'
import type { Snapshot } from './snapshot.ts'

const directory = resolve(import.meta.dirname, '../../../.amber/telegram')
let hidden = false
const output = new Writable({
  write(chunk, _encoding, done) {
    if (!hidden) process.stdout.write(chunk)
    done()
  },
})
const input = createInterface({
  input: process.stdin,
  output,
  terminal: Boolean(process.stdin.isTTY),
})
const prompt = async (label: string) => (await input.question(label)).trim()
const secret = async (label: string) => {
  process.stdout.write(label)
  hidden = true
  try {
    return await prompt('')
  } finally {
    hidden = false
    process.stdout.write('\n')
  }
}
const readOptional = async (path: string) => {
  try {
    return await readFile(path, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return ''
    throw error
  }
}
const save = async (name: string, value: string) => {
  const path = resolve(directory, name)
  await writeFile(`${path}.tmp`, value, { mode: 0o600 })
  await rename(`${path}.tmp`, path)
  await chmod(path, 0o600)
}

await mkdir(directory, { recursive: true, mode: 0o700 })
const configuration = JSON.parse(
  (await readOptional(resolve(directory, 'credentials.json'))) || '{}',
)
const apiId = Number(configuration.apiId || (await prompt('Telegram API ID: ')))
const apiHash = configuration.apiHash || (await prompt('Telegram API hash: '))
if (!Number.isSafeInteger(apiId) || apiId < 1 || !/^[a-f\d]{32}$/i.test(apiHash)) {
  input.close()
  throw new Error('Invalid Telegram API credentials. Check .amber/telegram/credentials.json.')
}
await save('credentials.json', JSON.stringify({ apiId, apiHash }))
const client = new TelegramClient(
  new StringSession(await readOptional(resolve(directory, 'account.session'))),
  apiId,
  apiHash,
  { connectionRetries: 3, floodSleepThreshold: 60 },
)
client.setLogLevel('none' as never)
try {
  await client.start({
    phoneNumber: () => prompt('Phone number (with country code): '),
    phoneCode: () => secret('Login code from Telegram: '),
    password: () => secret('Telegram 2FA password: '),
    onError: () => console.error('Telegram could not sign in. Check your login details and retry.'),
  })
  await save('account.session', String(client.session.save()))
  const matches = []
  for await (const dialog of client.iterDialogs({})) {
    if ((dialog.isGroup || dialog.isChannel) && /agent\s+junkies/i.test(dialog.title ?? ''))
      matches.push(dialog)
  }
  if (!matches.length) throw new Error('No Agent Junkies group found in this account.')
  for (const [index, dialog] of matches.entries())
    console.log(`${index + 1}. ${dialog.title} (${dialog.id})`)
  const choice = matches.length === 1 ? 1 : Number(await prompt('Choose the group number: '))
  const group = matches[choice - 1]
  if (!group?.entity) throw new Error('Invalid group selection.')
  const groupId = utils.getPeerId(group.entity).toString()
  const me = await client.getMe()
  const snapshot: Snapshot = {
    version: 1,
    groupId,
    groupName: group.title ?? 'Agent Junkies',
    accountId: me.id.toString(),
    importedAt: new Date().toISOString(),
    requestedCount: 500,
    authors: {},
    messages: [],
  }
  console.log(`Fetching the latest 500 messages from ${group.title}…`)
  for await (const message of client.iterMessages(group.entity, { limit: 500 })) {
    const sender = message.sender
    const authorId = message.senderId?.toString() ?? null
    if (authorId && sender) {
      snapshot.authors[authorId] = {
        name: utils.getDisplayName(sender) || authorId,
        ...('username' in sender && sender.username ? { username: sender.username } : {}),
      }
    }
    const username = 'username' in group.entity ? group.entity.username : undefined
    const sourceUrl = username
      ? `https://t.me/${username}/${message.id}`
      : group.entity instanceof Api.Channel
        ? `https://t.me/c/${group.entity.id}/${message.id}`
        : null
    snapshot.messages.push({
      id: String(message.id),
      authorId,
      text: message.message || '',
      replyToId: message.replyTo?.replyToMsgId ? String(message.replyTo.replyToMsgId) : null,
      albumId: message.groupedId?.toString() ?? null,
      date: new Date(message.date * 1000).toISOString(),
      sourceUrl,
      media: Boolean(message.media),
      service: Boolean(message.action),
    })
  }
  snapshot.messages.sort((a, b) => Number(a.id) - Number(b.id))
  await save('snapshot.json', JSON.stringify(snapshot, null, 2))
  console.log(`Saved ${snapshot.messages.length} messages locally. You can return to Codex.`)
} finally {
  input.close()
  await client.disconnect()
}
