import { Schema } from 'effect'
import { AnswerText, CommentText, EditPost } from '../domain/forms'
import type { Feed } from '../domain/post'

export type PreviewRole = 'visitor' | 'member' | 'author'
export type PreviewConversation = {
  question: string
  draft: string
  answer?: string
}
export type PreviewState = Feed & {
  role: PreviewRole
  savedByUser: Record<string, readonly string[]>
  readQuestionsByUser: Record<string, readonly string[]>
  conversations: Record<string, PreviewConversation>
}
export type PreviewAction =
  | { type: 'role'; role: PreviewRole }
  | { type: 'save'; postId: string }
  | { type: 'readQuestion'; postId: string }
  | { type: 'draftAnswer'; postId: string; text: string }
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
  | { type: 'answer'; postId: string; baseDetail: string; text: string }

export const currentUser = (role: PreviewRole) =>
  role === 'visitor' ? null : role === 'author' ? 'alex' : 'you'
export const createPreviewState = (feed: Feed): PreviewState => ({
  ...feed,
  role: 'visitor',
  savedByUser: {},
  readQuestionsByUser: {},
  conversations: Object.fromEntries(
    feed.posts.flatMap((post) =>
      post.question ? [[post.id, { question: post.question, draft: '' }]] : [],
    ),
  ),
})

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
  if (action.type === 'draftAnswer') {
    if (
      !post.question ||
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
  if (action.type === 'readQuestion') {
    const read = state.readQuestionsByUser[user] ?? []
    if (!post.question || read.includes(post.id)) return state
    return {
      ...state,
      readQuestionsByUser: {
        ...state.readQuestionsByUser,
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
  if (
    !post.question ||
    !conversation ||
    post.detail !== action.baseDetail ||
    !Schema.is(AnswerText)(action.text)
  )
    return state
  const { question: _question, ...rest } = post
  return {
    ...replace({
      ...rest,
      detail: [post.detail, action.text.trim()].filter(Boolean).join('\n\n'),
    }),
    conversations: {
      ...state.conversations,
      [post.id]: { ...conversation, answer: action.text.trim(), draft: '' },
    },
  }
}
