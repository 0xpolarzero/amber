import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useState,
} from 'react'
import type { Feed, Post } from '../domain/post'
import {
  createPreviewState,
  currentUser,
  type PreviewAction,
  type PreviewState,
  previewReducer,
} from './state'

export type PreviewDialog =
  | { kind: 'signin'; savePostId?: string }
  | { kind: 'account' }
  | { kind: 'menu' | 'edit' | 'question' | 'remove'; postId: string }
  | null

type PreviewContext = {
  state: PreviewState
  user: string | null
  saved: readonly string[]
  messages: readonly Post[]
  readQuestions: readonly string[]
  unreadCount: number
  dispatch: Dispatch<PreviewAction>
  dialog: PreviewDialog
  openDialog: Dispatch<PreviewDialog>
  notice: string
  notify: (message: string) => void
  save: (postId: string) => void
  share: (postId: string) => Promise<void>
}
const Context = createContext<PreviewContext | null>(null)

export function PreviewProvider({
  feed,
  children,
}: {
  feed: Feed
  children: ReactNode
}) {
  const [state, dispatch] = useReducer(previewReducer, feed, createPreviewState)
  const [dialog, setDialog] = useState<PreviewDialog>(null)
  const [notice, setNotice] = useState({ text: '', sequence: 0 })
  const user = currentUser(state.role)
  const saved = user ? (state.savedByUser[user] ?? []) : []
  const messages = user
    ? state.posts.filter((post) => post.author === user && post.question)
    : []
  const readQuestions = user ? (state.readQuestionsByUser[user] ?? []) : []
  const unreadCount = messages.filter(
    (post) => !readQuestions.includes(post.id),
  ).length
  const openDialog = (next: PreviewDialog) => {
    if (next?.kind === 'question')
      dispatch({ type: 'readQuestion', postId: next.postId })
    setDialog(next)
  }
  useEffect(() => {
    if (!notice.text) return
    const timer = setTimeout(
      () => setNotice((current) => ({ ...current, text: '' })),
      3000,
    )
    return () => clearTimeout(timer)
  }, [notice])
  const notify = (text: string) =>
    setNotice((current) => ({ text, sequence: current.sequence + 1 }))
  const save = (postId: string) => {
    if (!user) {
      openDialog({ kind: 'signin', savePostId: postId })
      return
    }
    dispatch({ type: 'save', postId })
    notify(saved.includes(postId) ? 'Bookmark removed.' : 'Bookmarked.')
  }
  const share = async (postId: string) => {
    try {
      await navigator.clipboard.writeText(
        new URL(`/posts/${encodeURIComponent(postId)}`, window.location.origin)
          .href,
      )
      notify('Link copied.')
    } catch {
      notify('Open the post and copy its address to share it.')
    }
  }
  return (
    <Context
      value={{
        state,
        user,
        saved,
        messages,
        readQuestions,
        unreadCount,
        dispatch,
        dialog,
        openDialog,
        notice: notice.text,
        notify,
        save,
        share,
      }}
    >
      {children}
    </Context>
  )
}

export function usePreview() {
  const context = useContext(Context)
  if (!context) throw new Error('PreviewProvider is missing')
  return context
}
