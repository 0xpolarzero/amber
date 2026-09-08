import type { Feed, Post } from '../domain/post'
import captured from './generated/amber-real-preview'
import type {
  AgentConversation,
  AgentMemory,
  AgentMessage,
  AgentRun,
  AgentRunStage,
  PostChange,
  PreviewRole,
} from './state'

export const AGENT_SCENARIOS = [
  ['rich-complete', 'Recorded Gemini result'],
  ['extracted', 'Recorded extraction'],
  ['empty', 'Developer fixture: empty'],
  ['stage-planning', 'Simulation: planning'],
  ['stage-background-both', 'Simulation: background work'],
  ['failure-before-publication', 'Simulation: foreground failure'],
  ['failure-addressing', 'Simulation: request task failed'],
  ['retry-exhausted', 'Simulation: retry exhausted'],
  ['retry-stale', 'Simulation: stale retry'],
] as const

export type AgentScenarioId = (typeof AGENT_SCENARIOS)[number][0]

export type AgentGuideCheckpoint = {
  title: string
  notice: string
  scenarioId: AgentScenarioId
  targetMessageId?: string
  focusMessage?: boolean
  draft?: string
  revealProgress?: boolean
  revealMemory?: boolean
  revealSource?: boolean
  revealContext?: boolean
  expandedChangePostId?: string
  recovery?: 'memory' | 'addressing'
}

function required<T>(value: T | undefined, label: string): T {
  if (!value) throw new Error(`The recorded Amber preview has no ${label}.`)
  return value
}

const extractedQuestion = required(captured.telegram.questions[0], 'question')
const recordedPost = required(
  captured.telegram.posts.find(({ id }) => id === extractedQuestion?.postId),
  'question post',
)
const recordedDiff = required(
  captured.messaging.diffs.find(
    ({ postId }) => postId === extractedQuestion?.postId,
  ),
  'messaging diff',
)

export const AGENT_GUIDE: readonly AgentGuideCheckpoint[] = [
  {
    title: 'Invented Telegram source',
    notice:
      'Inspect the fictional batch, including Carl’s reply, Bea’s separate post update, and ignored news chatter.',
    scenarioId: 'extracted',
    targetMessageId: extractedQuestion.id,
    focusMessage: true,
    revealSource: true,
  },
  {
    title: 'Actual extraction',
    notice:
      'Gemini created the linked Noted post and asked one factual question that follows from Carl’s message.',
    scenarioId: 'extracted',
    targetMessageId: extractedQuestion.id,
    focusMessage: true,
  },
  {
    title: 'Maker answers',
    notice:
      'The fake maker reply answers the extracted question and repeats the concise, factual writing preference.',
    scenarioId: 'stage-planning',
    targetMessageId: `${captured.messaging.input.turnId}:user`,
    revealProgress: true,
  },
  {
    title: 'Recorded Gemini reply',
    notice:
      'The real messaging workflow updates Alex’s post, addresses the source question, and leaves Bea’s post untouched.',
    scenarioId: 'rich-complete',
    targetMessageId: captured.messaging.assistant.id,
    revealMemory: true,
    expandedChangePostId: recordedDiff.postId,
  },
  {
    title: 'Simulated background failure',
    notice:
      'Simulation: the recorded answer and post diff stay visible while only request resolution needs a retry.',
    scenarioId: 'failure-addressing',
    targetMessageId: captured.messaging.assistant.id,
    revealProgress: true,
    expandedChangePostId: recordedDiff.postId,
  },
  {
    title: 'Recovered safely',
    notice:
      'Simulation: retrying request resolution reuses the exact recorded answer and post diff without publishing twice.',
    scenarioId: 'failure-addressing',
    targetMessageId: captured.messaging.assistant.id,
    revealProgress: true,
    expandedChangePostId: recordedDiff.postId,
    recovery: 'addressing',
  },
]

export type AgentScenario = {
  role: PreviewRole
  conversation: AgentConversation
  posts: readonly Post[]
}

const recordedMemory: AgentMemory[] = captured.messaging.finalMemories.map(
  ({ id, text, version }) => ({ id, text, version }),
)

const amber = (
  id: string,
  text: string,
  extra: Partial<AgentMessage> = {},
): AgentMessage => ({ id, sender: 'amber', text, ...extra })
const user = (
  id: string,
  text: string,
  extra: Partial<AgentMessage> = {},
): AgentMessage => ({ id, sender: 'user', text, ...extra })

function projectPost(
  source: Post,
  value: {
    id: string
    authorId: string
    title: string
    summary: string
    detail: string
  },
): Post {
  return {
    ...source,
    id: value.id,
    author: value.authorId,
    time: 'Recorded run',
    title: value.title,
    summary: value.summary,
    detail: value.detail,
    project: value.title.startsWith('Noted') ? 'Noted' : value.title,
    domain: 'Extracted from invented Telegram messages',
    mark: 'n.',
    question: undefined,
    comments: [],
  }
}

function posts(feed: Feed) {
  const source =
    feed.posts.find(({ author }) => author === recordedPost.authorId) ??
    feed.posts[0]
  if (!source) return { before: feed.posts, after: feed.posts, post: undefined }
  const withoutAuthoredNoted = feed.posts.filter(
    ({ project }) => project !== 'Noted',
  )
  const before = projectPost(source, recordedDiff.before)
  const after = projectPost(source, recordedDiff.after)
  return {
    before: [...withoutAuthoredNoted, before],
    after: [...withoutAuthoredNoted, after],
    post: before,
  }
}

const changeFields = (['title', 'summary', 'detail'] as const)
  .filter((field) => recordedDiff.before[field] !== recordedDiff.after[field])
  .map((field) => ({
    field,
    before: recordedDiff.before[field],
    after: recordedDiff.after[field],
  }))

function recordedChange(feed: Feed): PostChange {
  const result = posts(feed)
  if (!result.post) throw new Error('The base feed has no post template.')
  return {
    kind: 'updated',
    postId: recordedDiff.postId,
    project: result.post.project,
    fields: changeFields,
    fromVersion: recordedDiff.before.version,
    toVersion: recordedDiff.after.version,
  }
}

const sourceMessages = captured.telegram.messages
  .filter(({ id }) => id !== '90')
  .map(({ id, authorId, text, replyToId }) => ({
    id,
    authorId,
    text,
    replyToId,
  }))
const sourceOutcomes = {
  posts: captured.telegram.posts.map((post) => ({
    authorId: post.authorId,
    title: post.title,
    outcome: captured.telegram.diffs.some(({ postId }) => postId === post.id)
      ? ('updated' as const)
      : ('created' as const),
    questionCount: captured.telegram.questions.filter(
      ({ postId }) => postId === post.id,
    ).length,
  })),
  ignored: captured.telegram.ignored,
}

function question(resolved = false): AgentMessage {
  return amber(extractedQuestion.id, extractedQuestion.text, {
    needsReply: true,
    intent: 'question',
    postId: extractedQuestion.postId ?? undefined,
    ...(resolved
      ? {
          resolution: 'answered' as const,
          addressedBy: `${captured.messaging.input.turnId}:user`,
        }
      : {}),
    source: {
      disclosure: captured.disclosure,
      batchId: captured.telegram.batchId,
      groupId: captured.telegram.groupId,
      messages: sourceMessages,
      outcomes: sourceOutcomes,
    },
  })
}

const inputMessage = () =>
  user(`${captured.messaging.input.turnId}:user`, captured.messaging.input.text)

function response(feed: Feed): AgentMessage {
  return amber(
    captured.messaging.assistant.id,
    captured.messaging.assistant.text,
    {
      changes: [recordedChange(feed)],
      usedMemories: recordedMemory,
    },
  )
}

const completeRun = (messageId: string): AgentRun => ({
  messageId,
  stage: 'complete',
  status: 'complete',
  published: true,
  autoPlay: false,
  memory: 'done',
  addressing: 'done',
  memoryAttempts: 1,
  addressingAttempts: 1,
  maxAttempts: 2,
})

const baseConversation = (
  messages: readonly AgentMessage[],
  memories: readonly AgentMemory[] = recordedMemory,
): AgentConversation => ({
  draft: '',
  messages,
  memories,
  memoryHistory: [],
  readThrough: messages.length,
  revision: 0,
})

const outcome = (feed: Feed) => ({
  responseId: captured.messaging.assistant.id,
  text: captured.messaging.assistant.text,
  changes: [recordedChange(feed)],
  memoryEvents: [],
  addressIds: [extractedQuestion.id],
})

function activeRun(feed: Feed, stage: AgentRunStage): AgentRun {
  const background = stage === 'background'
  return {
    messageId: `${captured.messaging.input.turnId}:user`,
    stage,
    status: 'running',
    published: background,
    autoPlay: false,
    memory: background ? 'running' : 'queued',
    addressing: background ? 'running' : 'queued',
    memoryAttempts: 0,
    addressingAttempts: 0,
    maxAttempts: 2,
    outcome: outcome(feed),
  }
}

export function buildAgentScenario(
  feed: Feed,
  id: AgentScenarioId,
): AgentScenario {
  const fixture = posts(feed)
  if (id === 'empty')
    return {
      role: 'author',
      conversation: baseConversation([], []),
      posts: fixture.before,
    }
  if (id === 'extracted')
    return {
      role: 'author',
      conversation: baseConversation([question(false)]),
      posts: fixture.before,
    }
  if (id === 'rich-complete')
    return {
      role: 'author',
      conversation: {
        ...baseConversation([question(true), inputMessage(), response(feed)]),
        readThrough: 2,
        run: completeRun(`${captured.messaging.input.turnId}:user`),
      },
      posts: fixture.after,
    }
  if (id.startsWith('stage-')) {
    const stage: AgentRunStage =
      id === 'stage-background-both' ? 'background' : 'planning'
    const run = activeRun(feed, stage)
    return {
      role: 'author',
      conversation: {
        ...baseConversation([
          question(false),
          inputMessage(),
          ...(stage === 'background' ? [response(feed)] : []),
        ]),
        run,
      },
      posts: stage === 'background' ? fixture.after : fixture.before,
    }
  }
  if (id === 'failure-before-publication') {
    const run = activeRun(feed, 'generating')
    run.status = 'failed'
    run.error = 'Simulated failure. Nothing was published.'
    return {
      role: 'author',
      conversation: {
        ...baseConversation([question(false), inputMessage()]),
        run,
      },
      posts: fixture.before,
    }
  }
  const run = activeRun(feed, 'complete')
  run.status = 'complete'
  run.published = true
  run.memory = 'done'
  run.addressing = id === 'retry-exhausted' ? 'exhausted' : 'failed'
  run.addressingAttempts = id === 'retry-exhausted' ? 2 : 1
  if (id === 'retry-stale') run.stale = true
  return {
    role: 'author',
    conversation: {
      ...baseConversation([question(false), inputMessage(), response(feed)]),
      run,
    },
    posts: fixture.after,
  }
}

export function illustrativeRun(feed: Feed, messageId: string): AgentRun {
  return { ...activeRun(feed, 'planning'), messageId, autoPlay: true }
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
