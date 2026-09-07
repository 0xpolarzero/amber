import { Schema } from 'effect'
import { AnswerText, CommentText, EditPost, MemoryText } from '../domain/forms'
import type { Feed } from '../domain/post'
import { agentExampleActions } from './agent-example'

export type PreviewRole = 'visitor' | 'member' | 'author'
export type PostUpdate = {
  field: 'title' | 'summary' | 'detail'
  before: string
  after: string
}
export type AgentMemory = { id: string; text: string; sourceMessageId?: string }
export type AgentMessage = {
  id: string
  sender: 'amber' | 'user'
  text: string
  postId?: string
  update?: PostUpdate
  sourceMessageId?: string
  memorySaved?: AgentMemory
  usedMemories?: readonly AgentMemory[]
  needsReply?: boolean
  addressedBy?: string
}
export const isUnaddressed = (message: AgentMessage) =>
  message.sender === 'amber' &&
  Boolean(message.needsReply) &&
  !message.addressedBy

// Timed illustration of the proposed workflow, not live agent execution.
export type AgentRun = { messageId: string; step: number }
export const isAgentBusy = (run?: AgentRun) => Boolean(run && run.step < 6)

export type AgentConversation = {
  draft: string
  messages: readonly AgentMessage[]
  memories: readonly AgentMemory[]
  readThrough: number
  run?: AgentRun
}
export type PreviewState = Feed & {
  role: PreviewRole
  savedByUser: Record<string, readonly string[]>
  agentByUser: Record<string, AgentConversation>
}
export type PreviewAction =
  | { type: 'role'; role: PreviewRole }
  | { type: 'save'; postId: string }
  | { type: 'readAgent' }
  | {
      type: 'markAnswered'
      messageIds: readonly string[]
      userMessageId: string
    }
  | { type: 'draftMessage'; text: string }
  | { type: 'saveMemory'; id: string; text: string; sourceMessageId?: string }
  | { type: 'forgetMemory'; id: string }
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
  | {
      type: 'sendMessage'
      postId?: string
      id: string
      text: string
      previewRun?: boolean
    }
  | { type: 'advanceRun'; userId: string; messageId: string; step: number }
  | {
      type: 'agentMessage'
      postId?: string
      id: string
      text: string
      memorySavedId?: string
      needsReply?: boolean
      memoryIds?: readonly string[]
    }
  | {
      type: 'applyPostUpdate'
      postId: string
      id: string
      sourceMessageId: string
      text: string
      update: PostUpdate
      memoryIds?: readonly string[]
    }

export const currentUser = (role: PreviewRole) =>
  role === 'visitor' ? null : role === 'author' ? 'alex' : 'you'
export function createPreviewState(feed: Feed): PreviewState {
  let state: PreviewState = {
    ...feed,
    role: 'author',
    savedByUser: {},
    agentByUser: Object.fromEntries(
      Object.keys(feed.people).map((id) => [
        id,
        { draft: '', messages: [], memories: [], readThrough: 0 },
      ]),
    ),
  }
  for (const action of agentExampleActions(feed))
    state = previewReducer(state, action)
  const agent = state.agentByUser.alex
  return {
    ...state,
    role: 'visitor',
    agentByUser: agent
      ? {
          ...state.agentByUser,
          alex: {
            ...agent,
            readThrough: Math.max(0, agent.messages.length - 1),
          },
        }
      : state.agentByUser,
  }
}

// Disposable browser state. Server authorization and durable agent memory come later.
export function previewReducer(
  state: PreviewState,
  action: PreviewAction,
): PreviewState {
  if (action.type === 'role') return { ...state, role: action.role }
  if (action.type === 'advanceRun') {
    const conversation = state.agentByUser[action.userId]
    const run = conversation?.run
    if (
      !run ||
      !isAgentBusy(run) ||
      run.messageId !== action.messageId ||
      run.step !== action.step
    )
      return state
    return {
      ...state,
      agentByUser: {
        ...state.agentByUser,
        [action.userId]: {
          ...conversation,
          run: { ...run, step: run.step + 1 },
        },
      },
    }
  }
  const user = currentUser(state.role)
  if (!user) return state
  const agent = state.agentByUser[user]
  if (!agent) return state
  if (action.type === 'sendMessage' && isAgentBusy(agent.run)) return state
  const withAgent = (next: AgentConversation): PreviewState => ({
    ...state,
    agentByUser: { ...state.agentByUser, [user]: next },
  })
  if (action.type === 'readAgent') {
    if (agent.readThrough === agent.messages.length) return state
    return withAgent({ ...agent, readThrough: agent.messages.length })
  }
  if (action.type === 'markAnswered') {
    const replyIndex = agent.messages.findIndex(
      (message) =>
        message.id === action.userMessageId && message.sender === 'user',
    )
    if (replyIndex < 0) return state
    const targets = agent.messages.filter(
      (message, index) =>
        action.messageIds.includes(message.id) &&
        index < replyIndex &&
        isUnaddressed(message),
    )
    if (!targets.length || targets.length !== new Set(action.messageIds).size)
      return state
    return withAgent({
      ...agent,
      messages: agent.messages.map((message) =>
        action.messageIds.includes(message.id)
          ? { ...message, addressedBy: action.userMessageId }
          : message,
      ),
    })
  }
  if (action.type === 'draftMessage') {
    if (action.text.length > 1000 || action.text === agent.draft) return state
    return withAgent({ ...agent, draft: action.text })
  }
  if (action.type === 'saveMemory') {
    if (!Schema.is(MemoryText)(action.text)) return state
    if (
      action.sourceMessageId &&
      !agent.messages.some(
        (message) =>
          message.id === action.sourceMessageId && message.sender === 'user',
      )
    )
      return state
    const existing = agent.memories.find((memory) => memory.id === action.id)
    const memory = {
      id: action.id,
      text: action.text.trim(),
      sourceMessageId: action.sourceMessageId ?? existing?.sourceMessageId,
    }
    return withAgent({
      ...agent,
      memories: existing
        ? agent.memories.map((item) => (item.id === action.id ? memory : item))
        : [...agent.memories, memory],
    })
  }
  if (action.type === 'forgetMemory') {
    if (!agent.memories.some((memory) => memory.id === action.id)) return state
    return withAgent({
      ...agent,
      memories: agent.memories.filter((memory) => memory.id !== action.id),
    })
  }
  const post = state.posts.find((post) => post.id === action.postId)
  if (
    action.type === 'sendMessage' ||
    action.type === 'agentMessage' ||
    action.type === 'applyPostUpdate'
  ) {
    if (
      !Schema.is(AnswerText)(action.text) ||
      agent.messages.some((message) => message.id === action.id) ||
      (action.postId && !post)
    )
      return state
    const memoryIds = 'memoryIds' in action ? (action.memoryIds ?? []) : []
    const usedMemories = agent.memories.filter((memory) =>
      memoryIds.includes(memory.id),
    )
    if (new Set(memoryIds).size !== usedMemories.length) return state
    const memorySaved =
      action.type === 'agentMessage' && action.memorySavedId
        ? agent.memories.find((memory) => memory.id === action.memorySavedId)
        : undefined
    if (action.type === 'agentMessage' && action.memorySavedId && !memorySaved)
      return state
    if (action.type === 'applyPostUpdate') {
      if (
        !post ||
        post.author !== user ||
        post[action.update.field] !== action.update.before ||
        action.update.before === action.update.after ||
        !Schema.is(EditPost)({
          ...post,
          [action.update.field]: action.update.after,
        })
      )
        return state
      if (
        !agent.messages.some(
          (message) =>
            message.id === action.sourceMessageId && message.sender === 'user',
        )
      )
        return state
      if (
        agent.messages.some(
          (message) =>
            message.update &&
            message.sourceMessageId === action.sourceMessageId &&
            message.postId === post.id,
        )
      )
        return state
    }
    const message: AgentMessage = {
      id: action.id,
      sender: action.type === 'sendMessage' ? 'user' : 'amber',
      text: action.text.trim(),
      ...(action.postId ? { postId: action.postId } : {}),
      ...(usedMemories.length ? { usedMemories } : {}),
      ...(memorySaved ? { memorySaved } : {}),
      ...(action.type === 'agentMessage' && action.needsReply
        ? { needsReply: true }
        : {}),
      ...(action.type === 'applyPostUpdate'
        ? { update: action.update, sourceMessageId: action.sourceMessageId }
        : {}),
    }
    const next = withAgent({
      ...agent,
      draft: action.type === 'sendMessage' ? '' : agent.draft,
      messages: [...agent.messages, message],
      ...(action.type === 'sendMessage' && action.previewRun
        ? { run: { messageId: action.id, step: 0 } }
        : {}),
    })
    if (action.type !== 'applyPostUpdate') return next
    return {
      ...next,
      posts: next.posts.map((item) => {
        if (item.id !== action.postId) return item
        const { question: _question, ...rest } = item
        return { ...rest, [action.update.field]: action.update.after }
      }),
    }
  }
  if (!post) return state
  const replace = (next: typeof post): PreviewState => ({
    ...state,
    posts: state.posts.map((item) => (item.id === post.id ? next : item)),
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
      post.comments.some((comment) => comment.id === action.id)
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
      !post.comments.some(
        (comment) => comment.id === action.commentId && comment.author === user,
      )
    )
      return state
    return replace({
      ...post,
      comments: post.comments.filter(
        (comment) => comment.id !== action.commentId,
      ),
    })
  }
  if (post.author !== user) return state
  if (action.type === 'remove')
    return {
      ...state,
      posts: state.posts.filter((item) => item.id !== post.id),
    }
  if (!Schema.is(EditPost)(action)) return state
  return replace({
    ...post,
    title: action.title.trim(),
    summary: action.summary.trim(),
    detail: action.detail.trim(),
  })
}
