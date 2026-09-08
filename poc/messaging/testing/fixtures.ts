import type * as S from '../schemas'

export const userId = 'user-amber'
export const otherUserId = 'user-sable'
const message = (
  id: string,
  user: string,
  role: 'user' | 'assistant',
  text: string,
  sequence: number,
  turnId: string,
): typeof S.Message.Type => ({
  id,
  userId: user,
  conversationId: `conversation:${user}`,
  role,
  text,
  sequence,
  turnId,
  intent: 'informational',
  linkedPostId: null,
  pendingCandidateId: null,
  addressed: true,
})

const exchange = (n: number, user: string, text: string) => [
  message(`history-${n}:user`, userId, 'user', user, n * 2 - 1, `history-${n}`),
  message(`history-${n}:assistant`, userId, 'assistant', text, n * 2, `history-${n}`),
]

export const messages = [
  ...exchange(1, 'Aurora should remain invite-only.', 'Recorded for Aurora.'),
  ...exchange(2, 'The Noted icon is final.', 'Noted icon noted.'),
  ...exchange(3, 'Atlas works offline now.', 'Atlas post can reflect that.'),
  ...exchange(4, 'Use sentence case in titles.', 'I will preserve sentence case.'),
  ...exchange(5, 'Keep release details factual.', 'I will keep release details factual.'),
]

export const completedTurns = [1, 2, 3, 4, 5].map((n) => ({
  turnId: `history-${n}`,
  userMessageId: `history-${n}:user`,
  assistantMessageId: `history-${n}:assistant`,
}))

export const posts: readonly (typeof S.Post.Type)[] = [
  {
    id: 'noted',
    authorId: userId,
    version: 2,
    title: 'Noted',
    summary: 'Offline voice transcription for macOS.',
    detail: 'Noted transcribes English voice notes on device.',
    published: true,
  },
  {
    id: 'atlas',
    authorId: userId,
    version: 4,
    title: 'Atlas',
    summary: 'A visual workspace for research.',
    detail: 'Atlas connects notes and sources.',
    published: true,
  },
  {
    id: 'aurora',
    authorId: userId,
    version: 1,
    title: 'Aurora',
    summary: 'A collaborative planning tool in public beta.',
    detail: 'Aurora helps teams plan launches. Public beta access is available.',
    published: true,
  },
  {
    id: 'foreign-post',
    authorId: otherUserId,
    version: 7,
    title: 'Foreign',
    summary: 'Another user’s private project.',
    detail: 'Never visible to Amber user queries.',
    published: true,
  },
]

export const memories: readonly (typeof S.Memory.Type)[] = [
  { id: 'style', userId, text: 'Keep posts short.', version: 1 },
  { id: 'platform', userId, text: 'Only mention macOS releases.', version: 3 },
  { id: 'foreign-memory', userId: otherUserId, text: 'Private preference.', version: 1 },
]

export const candidates: readonly (typeof S.Candidate.Type)[] = [
  {
    id: 'candidate-clipwise',
    userId,
    version: 1,
    title: 'Clipwise',
    summary: 'A clipboard organizer.',
    detail: 'License was not supplied.',
    status: 'pending',
  },
]

export const fixture = { posts, memories, messages, candidates, completedTurns }
