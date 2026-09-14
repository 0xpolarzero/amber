import { Api, type TelegramClient } from 'telegram'

const delivery = (type: { className: string }) => {
  const name = type.className.replace(/^auth\.(SentCodeType|CodeType)/, '')
  return (
    (
      {
        App: 'Telegram service chat',
        Sms: 'SMS',
        Call: 'phone call',
        EmailCode: 'login email',
      } as Record<string, string>
    )[name] ?? name
  )
}

// GramJS's start() drops nextType/timeout. Keep them to support Telegram's actual fallback.
// https://core.telegram.org/method/auth.resendCode
export async function loginWithCode(
  client: Pick<TelegramClient, 'invoke' | 'signInWithPassword'>,
  credentials: { apiId: number; apiHash: string },
  io: {
    prompt: (label: string) => Promise<string>
    secret: (label: string) => Promise<string>
    log: (text: string) => void
    now?: () => number
  },
) {
  const now = io.now ?? Date.now
  const digits = (await io.prompt('Phone number (with country code): ')).replace(/[\s()+-]/g, '')
  if (!/^[1-9]\d{6,14}$/.test(digits)) throw new Error('Use your full international phone number.')
  const phoneNumber = `+${digits}`
  let sent = await client.invoke(
    new Api.auth.SendCode({
      ...credentials,
      phoneNumber,
      settings: new Api.CodeSettings({}),
    }),
  )
  let availableAt = now()
  const showDelivery = () => {
    if (!(sent instanceof Api.auth.SentCode)) return
    availableAt = now() + (sent.timeout ?? 0) * 1000
    io.log(`Telegram reports delivery to: ${delivery(sent.type)}.`)
    io.log(
      sent.nextType
        ? `If missing, type /resend after ${sent.timeout ?? 0}s. Next method: ${delivery(sent.nextType)}.`
        : 'Telegram offers no alternate delivery method for this attempt.',
    )
  }
  showDelivery()
  while (sent instanceof Api.auth.SentCode) {
    const code = (
      await io.prompt(sent.nextType ? 'Login code (or /resend): ' : 'Login code: ')
    ).trim()
    if (code === '/resend') {
      if (!sent.nextType) {
        io.log('No fallback offered. Stop with Ctrl+C.')
        continue
      }
      if (now() < availableAt) {
        io.log(`Wait ${Math.ceil((availableAt - now()) / 1000)}s before /resend.`)
        continue
      }
      sent = await client.invoke(
        new Api.auth.ResendCode({ phoneNumber, phoneCodeHash: sent.phoneCodeHash }),
      )
      showDelivery()
      continue
    }
    if (!code) continue
    try {
      const result = await client.invoke(
        new Api.auth.SignIn({ phoneNumber, phoneCodeHash: sent.phoneCodeHash, phoneCode: code }),
      )
      if (result instanceof Api.auth.AuthorizationSignUpRequired)
        throw new Error(
          'This number has no existing account. Check the number in Telegram Desktop Settings.',
        )
      return
    } catch (error) {
      const name =
        error && typeof error === 'object' && 'errorMessage' in error ? error.errorMessage : ''
      if (name === 'PHONE_CODE_INVALID') {
        io.log('Incorrect code. Try again or use /resend.')
        continue
      }
      if (name === 'SESSION_PASSWORD_NEEDED') {
        await client.signInWithPassword(credentials, {
          password: () => io.secret('Telegram 2FA password: '),
          onError: async () => true,
        })
        return
      }
      throw error
    }
  }
  if (!(sent instanceof Api.auth.SentCodeSuccess))
    throw new Error('Unsupported Telegram login response.')
}
