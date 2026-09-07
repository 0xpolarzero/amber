import { Schema } from 'effect'
import { AnswerText, CommentText, EditPost } from '../domain/forms'
import type { Feed } from '../domain/post'
import { conversationExample } from './conversation-example'

export type PreviewRole = 'visitor' | 'member' | 'author'
export type PostUpdate = {
  field: 'title' | 'summary' | 'detail'
  before: string
  after: string
}
export type PreviewMessage = {
  id: string
  sender: 'amber' | 'author'
  text: string
  update?: PostUpdate
  sourceMessageId?: string
}
export type PreviewConversation = {
  draft: string
  messages: readonly PreviewMessage[]
}
export type PreviewState = Feed & {
  role: PreviewRole
  savedByUser: Record<string, readonly string[]>
  readConversationsByUser: Record<string, readonly string[]>
  conversations: Record<string, PreviewConversation>
}
export type PreviewAction =
  | { type: 'role'; role: PreviewRole }
  | { type: 'save'; postId: string }
  | { type: 'readConversation'; postId: string }
  | { type: 'draftMessage'; postId: string; text: string }
  | { type: 'remove'; postId: string }
  | { type: 'comment'; postId: string; id: string; text: string }
  | { type: 'deleteComment'; postId: string; commentId: string }
  | {
      type: 'edit'
      postId: string
      title: string
      summary: string
      detail: string
    }
  | { type: 'sendMessage'; postId: string; id: string; text: string }
  | {
      type: 'applyPostUpdate'
      postId: string
      id: string
      sourceMessageId: string
      text: string
      update: PostUpdate
    }

export const currentUser = (role: PreviewRole) =>
  role === 'visitor' ? null : role === 'author' ? 'alex' : 'you'
export function createPreviewState(feed: Feed): PreviewState {
  const initial: PreviewState = {
    ...feed,
    role: 'visitor',
    savedByUser: {},
    readConversationsByUser: {},
    conversations: Object.fromEntries(
      feed.posts.flatMap((post) =>
        post.question
          ? [
              [
                post.id,
                {
                  draft: '',
                  messages: [
                    {
                      id: `${post.id}-question`,
                      sender: 'amber',
                      text: post.question,
                    },
                  ],
                },
              ],
            ]
          : [],
      ),
    ),
  }
  const post = feed.posts.find(
    (post) => post.id === conversationExample.postId && post.author === 'alex',
  )
  if (!post?.question) return initial
  // A scripted example uses the same message/update actions as the preview.
  const replied = previewReducer(
    { ...initial, role: 'author' },
    {
      type: 'sendMessage',
      postId: post.id,
      id: 'example-reply',
      text: conversationExample.reply,
    },
  )
  const updated = previewReducer(replied, {
    type: 'applyPostUpdate',
    postId: post.id,
    id: 'example-update',
    sourceMessageId: 'example-reply',
    text: conversationExample.response,
    update: {
      field: 'summary',
      before: post.summary,
      after: conversationExample.summary,
    },
  })
  return { ...updated, role: 'visitor' }
}

// A disposable browser preview, not authentication or server authorization.
export function previewReducer(
  state: PreviewState,
  action: PreviewAction,
): PreviewState {
  if (action.type === 'role') return { ...state, role: action.role }
  const user = currentUser(state.role)
  const post = state.posts.find((post) => post.id === action.postId)
  if (!user || !post) return state
  const replace = (next: typeof post): PreviewState => ({
    ...state,
    posts: state.posts.map((p) => (p.id === post.id ? next : p)),
  })
  if (action.type === 'save') {
    const saved = state.savedByUser[user] ?? []
    return {
      ...state,
      savedByUser: {
        ...state.savedByUser,
        [user]: saved.includes(post.id)
          ? saved.filter((id) => id !== post.id)
          : [...saved, post.id],
      },
    }
  }
  if (action.type === 'comment') {
    if (
      !Schema.is(CommentText)(action.text) ||
      post.comments.some((c) => c.id === action.id)
    )
      return state
    return replace({
      ...post,
      comments: [
        ...post.comments,
        {
          id: action.id,
          author: user,
          text: action.text.trim(),
          time: 'Just now',
        },
      ],
    })
  }
  if (action.type === 'deleteComment') {
    if (
      !post.comments.some((c) => c.id === action.commentId && c.author === user)
    )
      return state
    return replace({
      ...post,
      comments: post.comments.filter((c) => c.id !== action.commentId),
    })
  }
  if (post.author !== user) return state
  const conversation = state.conversations[post.id]
  if (action.type === 'draftMessage') {
    if (
      !conversation ||
      action.text.length > 1000 ||
      conversation.draft === action.text
    )
      return state
    return {
      ...state,
      conversations: {
        ...state.conversations,
        [post.id]: { ...conversation, draft: action.text },
      },
    }
  }
  if (action.type === 'readConversation') {
    const read = state.readConversationsByUser[user] ?? []
    if (!conversation || read.includes(post.id)) return state
    return {
      ...state,
      readConversationsByUser: {
        ...state.readConversationsByUser,
        [user]: [...read, post.id],
      },
    }
  }
  if (action.type === 'remove') {
    const { [post.id]: _conversation, ...conversations } = state.conversations
    return {
      ...state,
      posts: state.posts.filter((p) => p.id !== post.id),
      conversations,
    }
  }
  if (action.type === 'edit') {
    if (!Schema.is(EditPost)(action)) return state
    return replace({
      ...post,
      title: action.title.trim(),
      summary: action.summary.trim(),
      detail: action.detail.trim(),
    })
  }
  if (!conversation) return state
  if (action.type === 'sendMessage') {
    if (
      !Schema.is(AnswerText)(action.text) ||
      conversation.messages.some((message) => message.id === action.id)
    )
      return state
    return {
      ...state,
      conversations: {
        ...state.conversations,
        [post.id]: {
          ...conversation,
          draft: '',
          messages: [
            ...conversation.messages,
            { id: action.id, sender: 'author', text: action.text.trim() },
          ],
        },
      },
    }
  }
  const { update } = action
  if (
    post[update.field] !== update.before ||
    update.before === update.after ||
    !Schema.is(EditPost)({ ...post, [update.field]: update.after }) ||
    !Schema.is(AnswerText)(action.text) ||
    !conversation.messages.some(
      (message) =>
        message.id === action.sourceMessageId && message.sender === 'author',
    ) ||
    conversation.messages.some(
      (message) =>
        message.id === action.id ||
        message.sourceMessageId === action.sourceMessageId,
    )
  )
    return state
  const { question: _question, ...rest } = post
  return {
    ...replace({ ...rest, [update.field]: update.after }),
    conversations: {
      ...state.conversations,
      [post.id]: {
        ...conversation,
        messages: [
          ...conversation.messages,
          {
            id: action.id,
            sender: 'amber',
            text: action.text,
            update,
            sourceMessageId: action.sourceMessageId,
          },
        ],
      },
    },
  }
}
