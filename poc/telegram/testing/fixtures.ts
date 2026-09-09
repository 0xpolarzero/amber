import type * as S from '../schemas'

const message = (id: string, authorId: string, text: string, replyToId: string | null = null) => ({
  id,
  authorId,
  text,
  replyToId,
  albumId: null,
})

export const batch: typeof S.BatchContext.Type = {
  batchId: 'batch-1',
  groupId: 'ai-builders',
  associations: [],
  newMessageIds: ['101', '102', '103', '104', '105'],
  messages: [
    message('90', 'dana', 'I released Clipbook last month. It saves copied links.'), // Old context.
    message('101', 'carl', 'The new Gemini announcement looks impressive!'),
    message(
      '102',
      'alex',
      'I built Noted: voice notes transcribed locally on a Mac. https://noted.example',
    ),
    message(
      '103',
      'bea',
      'Tab tidy update: it now groups tabs by project, not just domain. GitHub, docs and issues can stay together.',
    ),
    message('104', 'alex', 'It uses Whisper on the device. It is free and works offline.', '102'),
    message('105', 'carl', 'Does Noted understand Mandarin?', '102'),
  ],
}
export const initialPosts: readonly (typeof S.Post.Type)[] = [
  {
    id: 'tab-tidy',
    authorId: 'bea',
    version: 2,
    title: 'Tab tidy',
    summary: 'A Chrome extension that groups tabs by domain.',
    detail: 'Related tabs share a group based on their domain.',
  },
]
export const memories: Record<string, readonly (typeof S.Memory.Type)[]> = {
  alex: [{ id: 'style', text: 'Keep my posts short and factual. No hype.' }],
}
export const notedPage: typeof S.WebPage.Type = {
  url: 'https://noted.example',
  title: 'Noted',
  text: 'Noted is a free Mac app. It records voice notes and transcribes them locally with Whisper. No internet connection is required. Language support is not documented yet.',
}
