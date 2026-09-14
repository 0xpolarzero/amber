import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { createServerFn } from '@tanstack/react-start'
import { getRequest } from '@tanstack/react-start/server'
import { loadFeed } from './feed'

export function validateLocalReply(request: Request, value: unknown) {
  const url = new URL(request.url)
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    request.headers.get('origin') !== url.origin
  )
    throw new Error(
      'Real demo messages can only be sent from the local website.',
    )
  if (!value || typeof value !== 'object') throw new Error('Invalid message.')
  const { authorId, text } = value as { authorId?: unknown; text?: unknown }
  if (
    typeof authorId !== 'string' ||
    !authorId ||
    authorId.length > 200 ||
    typeof text !== 'string' ||
    !text.trim() ||
    text.length > 8000
  )
    throw new Error('Enter a message of at most 8,000 characters.')
  return { authorId, text: text.trim() }
}

export const submitRealReply = createServerFn({ method: 'POST' })
  .validator((value: { authorId: string; text: string }) => value)
  .handler(async ({ data }) => {
    const input = validateLocalReply(getRequest(), data)
    await new Promise<void>((done, reject) => {
      const child = spawn(
        process.execPath,
        [
          '--env-file=.amber/openrouter.env',
          '--import',
          './poc/shared/register.ts',
          'poc/messaging/live/reply.ts',
        ],
        { cwd: resolve('.'), stdio: ['pipe', 'ignore', 'pipe'] },
      )
      let stderr = ''
      child.stderr.setEncoding('utf8')
      child.stderr.on('data', (chunk: string) => {
        stderr = (stderr + chunk).slice(-4000)
      })
      const timeout = setTimeout(() => child.kill('SIGTERM'), 660_000)
      child.once('error', (error) => {
        clearTimeout(timeout)
        reject(error)
      })
      child.once('close', (code) => {
        clearTimeout(timeout)
        if (code === 0) done()
        else {
          console.error(
            'Amber messaging workflow failed:',
            stderr.replace(/sk-or-v1-[\w-]+/g, '[redacted]'),
          )
          reject(
            new Error(
              'The agent could not finish. Your message was not confirmed; please retry.',
            ),
          )
        }
      })
      child.stdin.end(JSON.stringify(input))
    })
    return loadFeed()
  })
