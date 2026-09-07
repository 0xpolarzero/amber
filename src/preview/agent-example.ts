import type { Feed } from '../domain/post'
import type { PreviewAction } from './state'

// Scripted, applied examples. No model is running in this preview.
export function agentExampleActions(feed: Feed): readonly PreviewAction[] {
  const noted = feed.posts.find(
    (post) => post.id === 'voice-notes' && post.author === 'alex',
  )
  const tabs = feed.posts.find(
    (post) => post.id === 'tab-tidy' && post.author === 'alex',
  )
  if (!noted || !tabs) return []
  return [
    {
      type: 'agentMessage',
      id: 'noted-question',
      needsReply: true,
      postId: noted.id,
      text: 'Can someone try Noted, or is it still a personal tool?',
    },
    {
      type: 'sendMessage',
      id: 'noted-reply',
      postId: noted.id,
      text: 'There’s a free Mac demo. It supports English and Mandarin. For all my posts, keep the descriptions short and factual. No hype.',
    },
    {
      type: 'markAnswered',
      messageIds: ['noted-question'],
      userMessageId: 'noted-reply',
    },
    {
      type: 'saveMemory',
      id: 'writing-style',
      sourceMessageId: 'noted-reply',
      text: 'Keep post descriptions short and factual. Avoid promotional language.',
    },
    {
      type: 'agentMessage',
      id: 'memory-saved',
      text: 'I’ll remember that for your other posts too.',
      memorySavedId: 'writing-style',
    },
    {
      type: 'applyPostUpdate',
      id: 'noted-update',
      postId: noted.id,
      sourceMessageId: 'noted-reply',
      text: 'Added the demo details, keeping it short and factual.',
      memoryIds: ['writing-style'],
      update: {
        field: 'summary',
        before: noted.summary,
        after:
          'A voice note app for Mac with search by meaning, supporting English and Mandarin. It runs locally, with a free demo available.',
      },
    },
    {
      type: 'agentMessage',
      id: 'tabs-question',
      needsReply: true,
      postId: tabs.id,
      text: 'And for Tab tidy, is the beta free to try?',
    },
    {
      type: 'sendMessage',
      id: 'tabs-reply',
      postId: tabs.id,
      text: 'Yes, it’s a browser extension. Free while it’s in beta.',
    },
    {
      type: 'markAnswered',
      messageIds: ['tabs-question'],
      userMessageId: 'tabs-reply',
    },
    {
      type: 'applyPostUpdate',
      id: 'tabs-update',
      postId: tabs.id,
      sourceMessageId: 'tabs-reply',
      text: 'Added that. I used your preference for short, factual descriptions here too.',
      memoryIds: ['writing-style'],
      update: {
        field: 'summary',
        before: tabs.summary,
        after:
          'A browser extension that groups open tabs into a searchable library. The beta is free.',
      },
    },
    {
      type: 'agentMessage',
      id: 'noted-follow-up',
      postId: noted.id,
      needsReply: true,
      text: 'Does Noted work fully offline, including transcription?',
    },
  ]
}
