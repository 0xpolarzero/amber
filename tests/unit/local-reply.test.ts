import { expect, it } from 'vitest'
import { validateLocalReply } from '../../src/server/reply'

it('accepts a bounded local message and rejects cross-origin or remote requests', () => {
  const input = { authorId: '123', text: '  Update the post.  ' }
  const local = new Request('http://127.0.0.1:3000/reply', {
    headers: { origin: 'http://127.0.0.1:3000' },
  })
  expect(validateLocalReply(local, input)).toEqual({
    authorId: '123',
    text: 'Update the post.',
  })
  expect(() => validateLocalReply(new Request(local.url), input)).toThrow(
    'local website',
  )
  expect(() =>
    validateLocalReply(
      new Request(local.url, {
        headers: { origin: 'https://example.org' },
      }),
      input,
    ),
  ).toThrow('local website')
  expect(() =>
    validateLocalReply(
      new Request('https://example.org/reply', {
        headers: { origin: 'https://example.org' },
      }),
      input,
    ),
  ).toThrow('local website')
  expect(() =>
    validateLocalReply(local, { ...input, text: 'x'.repeat(8001) }),
  ).toThrow('8,000')
})
