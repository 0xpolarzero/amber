import type { Feed, Post } from '../domain/post'
import questionCapture from './generated/amber-question-preview'
import captured from './generated/amber-real-preview'
import type {
  AgentConversation,
  AgentMemory,
  AgentMessage,
  AgentRun,
  PostChange,
  PreviewRole,
} from './state'

export const AGENT_SCENARIOS = [
  ['replay', 'Recorded replay'],
  ['question-example', 'Telegram question'],
  ['rich-complete', 'Recorded result'],
  ['empty', 'Empty conversation'],
  ['failure-before-publication', 'Foreground failure'],
  ['failure-addressing', 'Background failure'],
  ['retry-exhausted', 'Retry limit'],
  ['retry-stale', 'Stale retry'],
] as const

export type AgentScenarioId = (typeof AGENT_SCENARIOS)[number][0]

export type AgentScenario = {
  role: PreviewRole
  conversation: AgentConversation
  posts: readonly Post[]
}

const beforeMemory: AgentMemory[] = captured.memory.before.map(
  ({ id, text, version }) => ({ id, text, version }),
)
const afterMemory: AgentMemory[] = captured.memory.after.map(
  ({ id, text, version }) => ({ id, text, version }),
)

type RecordedPost = {
  id: string
  authorId: string
  version: number
  title: string
  summary: string
  detail: string
}

function projectPost(source: Post, value: RecordedPost): Post {
  return {
    ...source,
    id: value.id,
    author: 'alex',
    time: 'Recorded run',
    title: value.title,
    summary: value.summary,
    detail: value.detail,
    project: value.title,
    domain: 'Recorded real-model PoC',
    mark: `${value.title.at(0)?.toLowerCase() ?? 'a'}.`,
    question: undefined,
    comments: [],
  }
}

function projectedPosts(feed: Feed, values: readonly RecordedPost[]) {
  const templates = feed.posts.length ? feed.posts : []
  if (!templates.length) return []
  return values.map((value, index) =>
    projectPost(templates[index % templates.length] as Post, value),
  )
}

const changeFields = (diff: { before: RecordedPost; after: RecordedPost }) =>
  (['title', 'summary', 'detail'] as const)
    .filter((field) => diff.before[field] !== diff.after[field])
    .map((field) => ({
      field,
      before: diff.before[field],
      after: diff.after[field],
    }))

function recordedChanges(feed: Feed): readonly PostChange[] {
  const afterPosts = projectedPosts(feed, captured.posts.after)
  return captured.posts.diffs.map((diff) => ({
    kind: 'updated' as const,
    postId: diff.postId,
    project: diff.after.title,
    fields: changeFields(diff),
    fromVersion: diff.before.version,
    toVersion: diff.after.version,
    post: afterPosts.find(({ id }) => id === diff.postId),
  }))
}

const pendingRequest = (): AgentMessage => ({
  id: captured.requests.before[0].id,
  sender: 'amber',
  text: captured.requests.before[0].text,
  postId: captured.requests.before[0].linkedPostId ?? undefined,
  intent: 'question',
  needsReply: true,
})

const inputMessage = (): AgentMessage => ({
  id: `${captured.input.turnId}:user`,
  sender: 'user',
  text: captured.input.text,
})

function response(feed: Feed): AgentMessage {
  return {
    id: captured.assistant.id,
    sender: 'amber',
    text: captured.assistant.text,
    changes: recordedChanges(feed),
    usedMemories: beforeMemory,
    usedHistory: captured.trace.context.userMessages.map(({ text }) => text),
  }
}

const outcome = (feed: Feed) => ({
  responseId: captured.assistant.id,
  text: captured.assistant.text,
  changes: recordedChanges(feed),
  memoryEvents: captured.trace.memory.operations.map((operation) => ({
    kind: 'replaced' as const,
    id: operation.id,
    before: captured.trace.memory.existing.find(({ id }) => id === operation.id)
      ?.text,
    after: operation.text,
  })),
  addressIds: captured.trace.addressing.resolutions.map(
    ({ requestMessageId }) => requestMessageId,
  ),
})

function baseConversation(
  messages: readonly AgentMessage[],
  memories: readonly AgentMemory[],
): AgentConversation {
  return {
    draft: '',
    messages,
    memories,
    memoryHistory: [],
    readThrough: messages.length,
    revision: 0,
  }
}

function activeRun(feed: Feed, autoPlay = false): AgentRun {
  return {
    messageId: `${captured.input.turnId}:user`,
    stage: 'planning',
    frame: 0,
    status: 'running',
    published: false,
    autoPlay,
    memory: 'queued',
    addressing: 'queued',
    memoryAttempts: 0,
    addressingAttempts: 0,
    maxAttempts: 2,
    trace: captured.trace,
    outcome: outcome(feed),
  }
}

function completeRun(feed: Feed): AgentRun {
  return {
    ...activeRun(feed),
    stage: 'complete',
    status: 'complete',
    published: true,
    memory: 'done',
    addressing: 'done',
    memoryAttempts: 1,
    addressingAttempts: 1,
  }
}

function lifecycleExample(feed: Feed, completed: boolean): AgentScenario {
  const { question, source, trace, replyTrace, messaging } = questionCapture
  const posts = projectedPosts(
    feed,
    messaging.diffs.map(({ after }) => after),
  )
  const changes: readonly PostChange[] = messaging.diffs.map((diff) => ({
    kind: 'updated',
    postId: diff.postId,
    project: diff.after.title,
    fields: changeFields(diff),
    fromVersion: diff.before.version,
    toVersion: diff.after.version,
  }))
  const run: AgentRun = {
    ...(completed ? completeRun(feed) : activeRun(feed)),
    messageId: `${messaging.input.turnId}:user`,
    trace: replyTrace,
    outcome: {
      responseId: messaging.assistant.id,
      text: messaging.assistant.text,
      changes,
      memoryEvents: replyTrace.memory.operations.map((operation) => ({
        kind: 'replaced' as const,
        id: operation.id,
        before: replyTrace.memory.existing.find(({ id }) => id === operation.id)
          ?.text,
        after: operation.text,
      })),
      addressIds: messaging.addressing.map(
        ({ requestMessageId }) => requestMessageId,
      ),
    },
  }
  const messages: AgentMessage[] = [
    {
      id: question.id,
      sender: 'amber',
      text: question.text,
      postId: question.postId,
      intent: 'question',
      needsReply: true,
      resolution: trace.telegramUpdate?.resolution.outcome,
      addressedBy: messaging.notification.id,
      source,
      trace,
    },
    {
      id: messaging.notification.id,
      sender: 'amber',
      text: messaging.notification.text,
      postId: messaging.notification.linkedPostId ?? undefined,
      intent: 'informational',
    },
    { id: run.messageId, sender: 'user', text: messaging.input.text },
  ]
  if (completed)
    messages.push({
      id: messaging.assistant.id,
      sender: 'amber',
      text: messaging.assistant.text,
      changes,
    })
  return {
    role: 'author',
    posts: completed
      ? posts
      : projectedPosts(
          feed,
          messaging.diffs.map(({ before }) => before),
        ),
    conversation: {
      ...baseConversation(
        messages,
        (completed ? messaging.finalMemories : captured.memory.before).map(
          ({ id, text, version }) => ({ id, text, version }),
        ),
      ),
      run,
    },
  }
}

export function buildAgentScenario(
  feed: Feed,
  id: AgentScenarioId,
): AgentScenario {
  if (id === 'question-example' || id === 'rich-complete')
    return lifecycleExample(feed, true)
  if (id === 'replay') return lifecycleExample(feed, false)
  const before = projectedPosts(feed, captured.posts.before)
  const after = projectedPosts(feed, captured.posts.after)
  if (id === 'empty')
    return {
      role: 'author',
      conversation: baseConversation([], []),
      posts: before,
    }
  if (id === 'failure-before-publication') {
    const run = activeRun(feed)
    run.stage = 'generating'
    run.status = 'failed'
    run.error = 'Simulated failure. Nothing was published.'
    return {
      role: 'author',
      conversation: {
        ...baseConversation([pendingRequest(), inputMessage()], beforeMemory),
        run,
      },
      posts: before,
    }
  }
  const run = completeRun(feed)
  run.addressing = id === 'retry-exhausted' ? 'exhausted' : 'failed'
  run.addressingAttempts = id === 'retry-exhausted' ? 2 : 1
  if (id === 'retry-stale') run.stale = true
  return {
    role: 'author',
    conversation: {
      ...baseConversation(
        [pendingRequest(), inputMessage(), response(feed)],
        afterMemory,
      ),
      run,
    },
    posts: after,
  }
}

export function illustrativeRun(feed: Feed, messageId: string): AgentRun {
  return { ...activeRun(feed, true), messageId }
}

export function applyFixturePostChanges(
  posts: readonly Post[],
  changes: readonly PostChange[],
) {
  return posts.map((post) => {
    const change = changes.find(({ postId }) => postId === post.id)
    if (!change) return post
    const patch = Object.fromEntries(
      change.fields.map(({ field, after }) => [field, after]),
    )
    const { question: _question, ...rest } = post
    return { ...rest, ...patch }
  })
}
