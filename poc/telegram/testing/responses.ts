import type * as S from '../schemas'
import type { NativeToolName, ToolName } from '../tools'

// Deliberately scripted AI decisions, not outputs from a live model.
// Everything after each response still goes through the real schemas, guards and workflow.
export const responses: {
  selection: typeof S.Selection.Type
  posts: Record<
    string,
    {
      tools: { name: ToolName; input: unknown }[]
      nativeTools?: { name: NativeToolName; input: unknown; output: unknown }[]
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
      ],
      nativeTools: [
        {
          name: 'read_url_content',
          input: { Url: 'https://noted.example' },
          output: 'Noted is an offline voice transcription app. https://noted.example',
        },
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
