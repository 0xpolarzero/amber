import type * as S from '../schemas'
import type { ToolName } from '../tools'

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

// Deliberately scripted AI decisions, not outputs from a live model.
// Everything after each response still goes through the real schemas, guards and workflow.
export const responses: {
  selection: typeof S.Selection.Type
  posts: Record<
    string,
    {
      tools: { name: ToolName; input: unknown }[]
      output: Extract<typeof S.Proposal.Type, { kind: 'post' }>
    }
  >
} = {
  selection: {
    candidates: [
      { authorId: 'alex', project: 'Noted', messageIds: ['102', '104', '105'] },
      { authorId: 'bea', project: 'Tab tidy', messageIds: ['103'] },
    ],
    ignored: [{ messageId: '101', reason: 'Reaction to AI news, not work the sender made.' }],
  },
  posts: {
    alex: {
      tools: [
        { name: 'searchPosts', input: { query: 'Noted' } },
        { name: 'readMessages', input: { ids: ['104'] } },
        { name: 'readPage', input: { url: 'https://noted.example' } },
      ],
      output: {
        kind: 'post',
        existingPostId: null,
        expectedVersion: null,
        title: 'Noted',
        summary: 'A free Mac app that transcribes voice notes offline.',
        detail: 'Noted uses Whisper on the device. https://noted.example',
        sources: [
          { kind: 'telegram', messageId: '102' },
          { kind: 'telegram', messageId: '104' },
          { kind: 'web', url: 'https://noted.example' },
        ],
        question: 'Does Noted support Mandarin transcription?',
      },
    },
    bea: {
      tools: [{ name: 'searchPosts', input: { query: 'Tab tidy' } }],
      output: {
        kind: 'post',
        existingPostId: 'tab-tidy',
        expectedVersion: 2,
        title: 'Tab tidy',
        summary: 'A Chrome extension that groups tabs by project.',
        detail: 'A project’s GitHub, documentation and issue tabs can now share a group.',
        sources: [{ kind: 'telegram', messageId: '103' }],
        question: null,
      },
    },
  },
}
