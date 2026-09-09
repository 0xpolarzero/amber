import type * as S from '../schemas'
import type { NativeToolName, ToolName } from '../tools'

// Deliberately scripted AI decisions, not outputs from a live model.
// Everything after each response still goes through the real schemas, guards and workflow.
export const responses: {
  selection: typeof S.ModelSelection.Type
  posts: Record<
    string,
    {
      tools: { name: ToolName; input: unknown }[]
      nativeTools?: { name: NativeToolName; input: unknown; output: unknown }[]
      output: typeof S.Proposal.Type
    }
  >
} = {
  selection: {
    candidates: [
      {
        authorId: 'alex',
        project: 'Noted',
        messageIds: ['102', '104', '105'],
        target: { kind: 'new', ownerId: 'alex' },
      },
      {
        authorId: 'bea',
        project: 'Tab tidy',
        messageIds: ['103'],
        target: { kind: 'existing', targetId: 'tab-tidy' },
      },
    ],
    ignored: [
      {
        messageId: '101',
        category: 'non_work',
        reason: 'Reaction to AI news, not work the sender made.',
      },
    ],
    unresolved: [],
  },
  posts: {
    alex: {
      tools: [
        { name: 'searchPosts', input: { queries: ['Noted'] } },
        { name: 'readMessages', input: { ids: ['104'] } },
      ],
      nativeTools: [
        {
          name: 'read_url_content',
          input: { Url: 'https://noted.example' },
          // Deterministic native-tool fixture. Live verification is in native-web.test.ts.
          output: {
            provenance: 'antigravity-cli-step-artifact-v1',
            status: 'success',
            toolOutput:
              'The full content of the article at https://noted.example/ has been saved to: /fixture/content.md',
            pageContent:
              'Title: Noted\nSource: https://noted.example/\n\nNoted is an offline voice transcription app.',
          },
        },
      ],
      output: {
        postEdit: {
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
        },
        resolutions: [],
        question: {
          text: 'Does Noted support Mandarin transcription?',
          sources: [{ kind: 'telegram', messageId: '105' }],
        },
        reason: 'New firsthand project evidence and one material unanswered question.',
      },
    },
    bea: {
      tools: [{ name: 'searchPosts', input: { queries: ['Tab tidy'] } }],
      output: {
        postEdit: {
          existingPostId: 'tab-tidy',
          expectedVersion: 2,
          title: 'Tab tidy',
          summary: 'A Chrome extension that groups tabs by project.',
          detail: 'A project’s GitHub, documentation and issue tabs can now share a group.',
          sources: [{ kind: 'telegram', messageId: '103' }],
        },
        resolutions: [],
        question: null,
        reason: 'The update materially changes the grouping behavior.',
      },
    },
  },
}
