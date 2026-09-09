import { Schema } from 'effect'
import { AnswerText, CommentText, EditPost, MemoryText } from '../domain/forms'
import type { Feed, Post } from '../domain/post'
import {
  type AgentScenarioId,
  applyFixturePostChanges,
  buildAgentScenario,
  illustrativeRun,
} from './agent-example'

export type PreviewRole = 'visitor' | 'member' | 'author'
export type PostFieldChange = {
  field: 'title' | 'summary' | 'detail'
  before: string
  after: string
}
export type PostChange = {
  kind: 'updated' | 'created'
  postId: string
  project: string
  fields: readonly PostFieldChange[]
  fromVersion?: number
  toVersion: number
  post?: Post
}
export type PostUpdate = PostFieldChange
export type AgentMemory = {
  id: string
  text: string
  version: number
  sourceMessageId?: string
}
export type AgentMemoryEvent = {
  kind: 'created' | 'replaced' | 'deleted'
  id: string
  before?: string
  after?: string
}
export type TelegramSource = {
  disclosure: string
  batchId: string
  groupId: string
  messages: readonly {
    id: string
    authorId: string | null
    text: string
    replyToId: string | null
  }[]
  outcomes: {
    posts: readonly {
      authorId: string
      title: string
      outcome: 'created' | 'updated'
      questionCount: number
    }[]
    ignored: readonly { messageId: string; reason: string }[]
  }
}
export type WorkflowTrace = {
  questionId: string
  authorId: string
  project: string
  selectedMessageIds: readonly string[]
  context: {
    existingPosts: readonly {
      id: string
      title: string
      summary: string
    }[]
    memories: readonly { id: string; text: string }[]
    outstandingRequests: readonly {
      id: string
      text: string
      intent: string
      linkedPostId: string | null
    }[]
    observedTools: readonly string[]
    observationScope: string
  }
  publication: {
    post: {
      id: string
      title: string
      summary: string
      detail: string
    }
    output: {
      existingPostId: string | null
      sources: readonly { kind: string; messageId: string }[]
    }
  }
  question: string
  telegramUpdate?: {
    batchId: string
    selectedMessageIds: readonly string[]
    messages: TelegramSource['messages']
    before: {
      id: string
      version: number
      title: string
      summary: string
      detail: string
    }
    after: {
      id: string
      version: number
      title: string
      summary: string
      detail: string
    }
    notification: {
      id: string
      text: string
      sourceIds: readonly string[]
    }
    resolution: {
      outcome: 'answered' | 'ignored'
      reason: string
      sourceIds: readonly string[]
    }
  }
  related: readonly {
    authorId: string
    project: string
    messageIds: readonly string[]
    existingPosts: readonly {
      id: string
      title: string
      summary: string
    }[]
    resultPost: {
      id: string
      title: string
      summary: string
    }
    outcome: 'created' | 'updated'
  }[]
  recording: { model: string; disclosure: string }
}
export type ReplyWorkflowTrace = {
  recording?: {
    model: string
    source: string
    turnId: string
    scripted: boolean
  }
  planner: {
    pendingRequests: readonly ReplyTraceMessage[]
    queries: readonly {
      resource: 'posts' | 'user_messages' | 'assistant_messages'
      terms: readonly string[]
      limit: number
    }[]
  }
  context: {
    posts: readonly {
      id: string
      version: number
      title: string
      summary: string
      detail: string
    }[]
    userMessages: readonly ReplyTraceMessage[]
    assistantMessages: readonly ReplyTraceMessage[]
    linkedRequestPostIds: readonly string[]
    memories: readonly { id: string; text: string; version?: number }[]
    unaddressed: readonly ReplyTraceMessage[]
  }
  response: {
    classification: string
    intent: string
    text: string
    pendingOutcome: { kind: string }
    postChanges: readonly {
      postId: string
      expectedVersion: number
      title: string
      summary: string
      detail: string
      evidence: readonly {
        kind: string
        id?: string
        version?: number
        url?: string
      }[]
    }[]
  }
  memory: {
    existing: readonly { id: string; text: string; version?: number }[]
    operations: readonly {
      kind: string
      id: string
      text?: string
      expectedVersion?: number
    }[]
  }
  addressing: {
    requests: readonly ReplyTraceMessage[]
    resolutions: readonly {
      requestMessageId: string
      outcome: 'answered' | 'ignored'
      reason: string
    }[]
  }
}
type ReplyTraceMessage = {
  id: string
  text: string
  linkedPostId: string | null
}
export type AgentMessage = {
  id: string
  sender: 'amber' | 'user'
  text: string
  postId?: string
  intent?: 'question' | 'request' | 'suggestion' | 'informational'
  needsReply?: boolean
  addressedBy?: string
  resolution?: 'answered' | 'ignored'
  deferred?: boolean
  changes?: readonly PostChange[]
  candidate?: {
    name: string
    status: 'pending' | 'clarification' | 'published'
  }
  memoryEvents?: readonly AgentMemoryEvent[]
  usedMemories?: readonly AgentMemory[]
  usedHistory?: readonly string[]
  source?: TelegramSource
  trace?: WorkflowTrace
  replyRun?: AgentRun
}
export const isUnaddressed = (message: AgentMessage) =>
  message.sender === 'amber' &&
  Boolean(message.needsReply) &&
  !message.resolution

export type AgentRunStage =
  | 'planning'
  | 'retrieving'
  | 'generating'
  | 'publishing'
  | 'background'
  | 'complete'
export type BackgroundStatus =
  | 'queued'
  | 'running'
  | 'done'
  | 'failed'
  | 'exhausted'
export type TurnOutcome = {
  responseId: string
  text: string
  changes: readonly PostChange[]
  memoryEvents: readonly AgentMemoryEvent[]
  addressIds: readonly string[]
}
export type AgentRun = {
  messageId: string
  stage: AgentRunStage
  frame: number
  status: 'running' | 'complete' | 'failed'
  published: boolean
  autoPlay: boolean
  memory: BackgroundStatus
  addressing: BackgroundStatus
  memoryAttempts: number
  addressingAttempts: number
  maxAttempts: number
  trace: ReplyWorkflowTrace
  outcome?: TurnOutcome
  error?: string
  stale?: boolean
}
export const isAgentBusy = (run?: AgentRun) => run?.status === 'running'

export type AgentConversation = {
  draft: string
  messages: readonly AgentMessage[]
  memories: readonly AgentMemory[]
  memoryHistory: readonly AgentMemoryEvent[]
  readThrough: number
  revision: number
  run?: AgentRun
}
export type PreviewState = Feed & {
  role: PreviewRole
  savedByUser: Record<string, readonly string[]>
  agentByUser: Record<string, AgentConversation>
  fixtureFeed: Feed
  scenarioId: AgentScenarioId
  scenarioRevision: number
  agentPosts: readonly Post[]
}
export type PreviewAction =
  | { type: 'role'; role: PreviewRole }
  | { type: 'loadScenario'; id: AgentScenarioId }
  | { type: 'restartRun'; playing: boolean }
  | { type: 'save'; postId: string }
  | { type: 'readAgent' }
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
  | {
      type: 'advanceRun'
      userId: string
      messageId: string
      stage: AgentRunStage
      memory?: BackgroundStatus
      addressing?: BackgroundStatus
    }
  | { type: 'setRunPlaying'; playing: boolean }
  | { type: 'retryBackground'; task: 'memory' | 'addressing' }

export const currentUser = (role: PreviewRole) =>
  role === 'visitor' ? null : role === 'author' ? 'alex' : 'you'

const emptyConversation = (): AgentConversation => ({
  draft: '',
  messages: [],
  memories: [],
  memoryHistory: [],
  readThrough: 0,
  revision: 0,
})

export function createPreviewState(
  feed: Feed,
  scenarioId?: AgentScenarioId,
): PreviewState {
  const selected = scenarioId ?? 'rich-complete'
  const scenario = buildAgentScenario(feed, selected)
  const agentByUser = Object.fromEntries(
    Object.keys(feed.people).map((id) => [id, emptyConversation()]),
  )
  agentByUser.alex = scenario.conversation
  return {
    ...feed,
    posts: scenarioId ? scenario.posts : feed.posts,
    role: scenarioId ? scenario.role : 'visitor',
    savedByUser: {},
    agentByUser,
    fixtureFeed: feed,
    scenarioId: selected,
    scenarioRevision: 0,
    agentPosts: scenario.posts,
  }
}

function applyMemoryEvents(
  conversation: AgentConversation,
  events: readonly AgentMemoryEvent[],
): AgentConversation {
  let memories = [...conversation.memories]
  for (const event of events) {
    const existing = memories.find((memory) => memory.id === event.id)
    if (event.kind === 'deleted') {
      memories = memories.filter((memory) => memory.id !== event.id)
      continue
    }
    if (!event.after) continue
    const memory: AgentMemory = {
      id: event.id,
      text: event.after,
      version: (existing?.version ?? 0) + 1,
      sourceMessageId: existing?.sourceMessageId,
    }
    memories = existing
      ? memories.map((item) => (item.id === event.id ? memory : item))
      : [...memories, memory]
  }
  return {
    ...conversation,
    memories,
    memoryHistory: [...conversation.memoryHistory, ...events],
    messages: conversation.messages.map((message) =>
      message.id === conversation.run?.outcome?.responseId
        ? { ...message, memoryEvents: events }
        : message,
    ),
  }
}

function finishAddressing(
  conversation: AgentConversation,
  ids: readonly string[],
): AgentConversation {
  return {
    ...conversation,
    messages: conversation.messages.map((message) =>
      ids.includes(message.id) && isUnaddressed(message)
        ? {
            ...message,
            resolution: 'answered' as const,
            addressedBy: conversation.run?.messageId,
          }
        : message,
    ),
  }
}

function advanceRun(state: PreviewState, userId: string): PreviewState {
  const conversation = state.agentByUser[userId]
  const run = conversation?.run
  if (!conversation || !run || run.status !== 'running') return state
  let nextConversation = conversation
  let posts = state.posts
  let agentPosts = state.agentPosts
  let nextRun = run
  const contextRecordCount =
    run.trace.context.posts.length +
    run.trace.context.userMessages.length +
    run.trace.context.assistantMessages.length +
    run.trace.context.memories.length +
    run.trace.context.unaddressed.length
  const frameLimit =
    run.stage === 'planning'
      ? Math.max(1, run.trace.planner.queries.length)
      : run.stage === 'retrieving'
        ? Math.max(1, contextRecordCount)
        : run.stage === 'generating'
          ? Math.max(3, run.trace.response.postChanges.length)
          : 1
  if (run.stage !== 'complete' && run.frame < frameLimit) {
    nextRun = { ...run, frame: run.frame + 1 }
  } else if (run.stage === 'planning')
    nextRun = { ...run, stage: 'retrieving', frame: 0 }
  else if (run.stage === 'retrieving')
    nextRun = { ...run, stage: 'generating', frame: 0 }
  else if (run.stage === 'generating')
    nextRun = { ...run, stage: 'publishing', frame: 0 }
  else if (run.stage === 'publishing') {
    const result = run.outcome
    if (!result) {
      nextRun = {
        ...run,
        status: 'failed',
        error: 'I couldn’t prepare a supported answer. Nothing was published.',
      }
    } else {
      posts = applyFixturePostChanges(posts, result.changes)
      agentPosts = applyFixturePostChanges(agentPosts, result.changes)
      const response: AgentMessage = {
        id: result.responseId,
        sender: 'amber',
        text: result.text,
        changes: result.changes,
      }
      nextConversation = {
        ...nextConversation,
        messages: nextConversation.messages.some(
          (message) => message.id === response.id,
        )
          ? nextConversation.messages
          : [...nextConversation.messages, response],
      }
      nextRun = {
        ...run,
        stage: 'background',
        frame: 0,
        published: true,
        memory: 'running',
        addressing: 'running',
      }
    }
  } else if (run.stage === 'background') {
    const outcome = run.outcome
    if (run.memory === 'running')
      nextConversation = applyMemoryEvents(
        nextConversation,
        outcome?.memoryEvents ?? [],
      )
    if (run.addressing === 'running')
      nextConversation = finishAddressing(
        nextConversation,
        outcome?.addressIds ?? [],
      )
    const memory = run.memory === 'running' ? 'done' : run.memory
    const addressing = run.addressing === 'running' ? 'done' : run.addressing
    const complete = memory === 'done' && addressing === 'done'
    nextRun = {
      ...run,
      stage: complete ? 'complete' : 'background',
      frame: 0,
      status: complete ? 'complete' : 'failed',
      autoPlay: false,
      memory,
      addressing,
    }
  }
  nextConversation = { ...nextConversation, run: nextRun }
  return {
    ...state,
    posts,
    agentPosts,
    agentByUser: { ...state.agentByUser, [userId]: nextConversation },
  }
}

export function previewReducer(
  state: PreviewState,
  action: PreviewAction,
): PreviewState {
  if (action.type === 'loadScenario') {
    const next = createPreviewState(state.fixtureFeed, action.id)
    return { ...next, scenarioRevision: state.scenarioRevision + 1 }
  }
  if (action.type === 'restartRun') {
    const next = createPreviewState(state.fixtureFeed, 'replay')
    return {
      ...next,
      agentByUser: {
        ...next.agentByUser,
        alex: {
          ...next.agentByUser.alex,
          run: next.agentByUser.alex.run
            ? { ...next.agentByUser.alex.run, autoPlay: action.playing }
            : undefined,
        },
      },
      scenarioRevision: state.scenarioRevision + 1,
    }
  }
  if (action.type === 'role') return { ...state, role: action.role }
  if (action.type === 'advanceRun') {
    const conversation = state.agentByUser[action.userId]
    const run = conversation?.run
    if (
      !run ||
      run.messageId !== action.messageId ||
      run.stage !== action.stage ||
      (action.memory && run.memory !== action.memory) ||
      (action.addressing && run.addressing !== action.addressing)
    )
      return state
    return advanceRun(state, action.userId)
  }
  const userId = currentUser(state.role)
  if (!userId) return state
  const agent = state.agentByUser[userId]
  if (!agent) return state
  const withAgent = (conversation: AgentConversation): PreviewState => ({
    ...state,
    agentByUser: { ...state.agentByUser, [userId]: conversation },
  })
  if (action.type === 'setRunPlaying') {
    if (agent.run?.status !== 'running') return state
    return withAgent({
      ...agent,
      run: { ...agent.run, autoPlay: action.playing },
    })
  }
  if (action.type === 'retryBackground') {
    const run = agent.run
    if (!run || run.stale) return state
    const status = run[action.task]
    const attempts =
      action.task === 'memory' ? run.memoryAttempts : run.addressingAttempts
    if (status !== 'failed' || attempts >= run.maxAttempts) return state
    const nextRun: AgentRun = {
      ...run,
      stage: 'background',
      frame: 0,
      status: 'running',
      autoPlay: false,
      [action.task]: 'running',
      ...(action.task === 'memory'
        ? { memoryAttempts: attempts + 1 }
        : { addressingAttempts: attempts + 1 }),
    }
    return withAgent({ ...agent, run: nextRun })
  }
  if (action.type === 'readAgent') {
    if (agent.readThrough === agent.messages.length) return state
    return withAgent({ ...agent, readThrough: agent.messages.length })
  }
  if (action.type === 'draftMessage') {
    if (action.text.length > 1000 || action.text === agent.draft) return state
    return withAgent({ ...agent, draft: action.text })
  }
  if (action.type === 'saveMemory') {
    if (!Schema.is(MemoryText)(action.text)) return state
    const existing = agent.memories.find((memory) => memory.id === action.id)
    const text = action.text.trim()
    if (existing?.text === text) return state
    const memory: AgentMemory = {
      id: action.id,
      text,
      version: (existing?.version ?? 0) + 1,
      sourceMessageId: action.sourceMessageId ?? existing?.sourceMessageId,
    }
    const event: AgentMemoryEvent = existing
      ? { kind: 'replaced', id: action.id, before: existing.text, after: text }
      : { kind: 'created', id: action.id, after: text }
    return withAgent({
      ...agent,
      memories: existing
        ? agent.memories.map((item) => (item.id === action.id ? memory : item))
        : [...agent.memories, memory],
      memoryHistory: [...agent.memoryHistory, event],
    })
  }
  if (action.type === 'forgetMemory') {
    const existing = agent.memories.find((memory) => memory.id === action.id)
    if (!existing) return state
    return withAgent({
      ...agent,
      memories: agent.memories.filter((memory) => memory.id !== action.id),
      memoryHistory: [
        ...agent.memoryHistory,
        { kind: 'deleted', id: existing.id, before: existing.text },
      ],
    })
  }
  if (action.type === 'sendMessage') {
    if (
      isAgentBusy(agent.run) ||
      !Schema.is(AnswerText)(action.text) ||
      agent.messages.some((message) => message.id === action.id)
    )
      return state
    const message: AgentMessage = {
      id: action.id,
      sender: 'user',
      text: action.text.trim(),
      ...(action.postId ? { postId: action.postId } : {}),
    }
    return withAgent({
      ...agent,
      draft: '',
      messages: [
        ...agent.messages.map((item) =>
          action.previewRun && item.id === agent.run?.outcome?.responseId
            ? { ...item, replyRun: agent.run }
            : item,
        ),
        message,
      ],
      revision: agent.revision + 1,
      ...(action.previewRun
        ? { run: illustrativeRun(state.fixtureFeed, action.id) }
        : {}),
    })
  }
  const post = state.posts.find((item) => item.id === action.postId)
  if (!post) return state
  const replace = (next: Post): PreviewState => ({
    ...state,
    posts: state.posts.map((item) => (item.id === post.id ? next : item)),
  })
  if (action.type === 'save') {
    const saved = state.savedByUser[userId] ?? []
    return {
      ...state,
      savedByUser: {
        ...state.savedByUser,
        [userId]: saved.includes(post.id)
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
          author: userId,
          text: action.text.trim(),
          time: 'Just now',
        },
      ],
    })
  }
  if (action.type === 'deleteComment') {
    if (
      !post.comments.some(
        (comment) =>
          comment.id === action.commentId && comment.author === userId,
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
  if (post.author !== userId) return state
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
