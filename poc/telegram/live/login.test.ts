import { Api, type TelegramClient } from 'telegram'
import { expect, it } from 'vitest'
import { loginWithCode } from './login'

it('waits for Telegram timeout, resends with the current hash, then signs in with the new hash', async () => {
  let time = 0
  const requests: { className: string; phoneCodeHash?: string }[] = []
  const answers = ['/resend', '/resend', '12345']
  const log: string[] = []
  const client = {
    invoke: async (request: { className: string; phoneCodeHash?: string }) => {
      requests.push(request)
      if (request.className === 'auth.SendCode')
        return new Api.auth.SentCode({
          type: new Api.auth.SentCodeTypeApp({ length: 5 }),
          phoneCodeHash: 'first',
          nextType: new Api.auth.CodeTypeSms(),
          timeout: 30,
        })
      if (request.className === 'auth.ResendCode')
        return new Api.auth.SentCode({
          type: new Api.auth.SentCodeTypeSms({ length: 5 }),
          phoneCodeHash: 'second',
        })
      return new Api.auth.Authorization({ user: {} as Api.TypeUser })
    },
  } as unknown as Pick<TelegramClient, 'invoke' | 'signInWithPassword'>
  await loginWithCode(
    client,
    { apiId: 1, apiHash: 'test' },
    {
      prompt: async (label) => {
        if (label.startsWith('Phone')) return '+39 300 000 0000'
        if (answers.length === 2) time = 30_000
        return answers.shift() ?? ''
      },
      secret: async () => {
        throw new Error('Code entry must remain visible')
      },
      log: (text) => log.push(text),
      now: () => time,
    },
  )
  expect(requests.map((request) => request.className)).toEqual([
    'auth.SendCode',
    'auth.ResendCode',
    'auth.SignIn',
  ])
  expect(requests[1]?.phoneCodeHash).toBe('first')
  expect(requests[2]?.phoneCodeHash).toBe('second')
  expect(log).toContain('Wait 30s before /resend.')
  expect(log).toContain('Telegram reports delivery to: SMS.')
})

it('does not invent a fallback when Telegram offers none', async () => {
  let calls = 0
  const answers = ['/resend', '12345']
  const log: string[] = []
  const client = {
    invoke: async () =>
      ++calls === 1
        ? new Api.auth.SentCode({
            type: new Api.auth.SentCodeTypeApp({ length: 5 }),
            phoneCodeHash: 'first',
          })
        : new Api.auth.Authorization({ user: {} as Api.TypeUser }),
  } as unknown as Pick<TelegramClient, 'invoke' | 'signInWithPassword'>
  await loginWithCode(
    client,
    { apiId: 1, apiHash: 'test' },
    {
      prompt: async (label) =>
        label.startsWith('Phone') ? '+393000000000' : (answers.shift() ?? ''),
      secret: async () => {
        throw new Error('Code entry must remain visible')
      },
      log: (text) => log.push(text),
    },
  )
  expect(calls).toBe(2)
  expect(log).toContain('No fallback offered. Stop with Ctrl+C.')
})
