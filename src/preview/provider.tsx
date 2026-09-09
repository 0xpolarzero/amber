import {
  createContext,
  type Dispatch,
  type ReactNode,
  useContext,
  useEffect,
  useReducer,
  useState,
} from 'react'
import type { Feed } from '../domain/post'
import {
  type AgentConversation,
  type AgentRun,
  createPreviewState,
  currentUser,
  isAgentBusy,
  type PreviewAction,
  type PreviewState,
  previewReducer,
} from './state'

export type PreviewDialog =
  | { kind: 'signin'; savePostId?: string }
  | { kind: 'menu' | 'edit' | 'remove'; postId: string }
  | null

type PreviewContext = {
  state: PreviewState
  user: string | null
  saved: readonly string[]
  agent: AgentConversation | null
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

export const REPLAY_INTERVAL_MS = 500

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
  const agent = user ? state.agentByUser[user] : null
  const unreadCount = agent
    ? agent.messages
        .slice(agent.readThrough)
        .filter((message) => message.sender === 'amber').length
    : 0
  const openDialog = setDialog
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
        agent,
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
      {Object.entries(state.agentByUser).map(([userId, conversation]) => (
        <PreviewRunClock
          key={userId}
          userId={userId}
          run={conversation.run}
          dispatch={dispatch}
        />
      ))}
      {children}
    </Context>
  )
}

function PreviewRunClock({
  userId,
  run,
  dispatch,
}: {
  userId: string
  run?: AgentRun
  dispatch: Dispatch<PreviewAction>
}) {
  useEffect(() => {
    if (!run || !isAgentBusy(run) || !run.autoPlay) return
    const timer = setTimeout(
      () =>
        dispatch({
          type: 'advanceRun',
          userId,
          messageId: run.messageId,
          stage: run.stage,
          memory: run.memory,
          addressing: run.addressing,
        }),
      REPLAY_INTERVAL_MS,
    )
    return () => clearTimeout(timer)
  }, [userId, run, dispatch])
  return null
}

export function usePreview() {
  const context = useContext(Context)
  if (!context) throw new Error('PreviewProvider is missing')
  return context
}
