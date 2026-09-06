import { Schema } from 'effect'
import { AnswerText, CommentText, EditPost } from '../domain/forms'
import type { Feed } from '../domain/post'

export type PreviewRole = 'visitor' | 'member' | 'author'
export type PreviewState = Feed & {
  role: PreviewRole
  savedByUser: Record<string, readonly string[]>
}
export type PreviewAction =
  | { type: 'role'; role: PreviewRole }
  | { type: 'save'; postId: string }
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
  if (action.type === 'remove')
    return { ...state, posts: state.posts.filter((p) => p.id !== post.id) }
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
    post.detail !== action.baseDetail ||
    !Schema.is(AnswerText)(action.text)
  )
    return state
  const { question: _question, ...rest } = post
  return replace({
    ...rest,
    detail: [post.detail, action.text.trim()].filter(Boolean).join('\n\n'),
  })
}
