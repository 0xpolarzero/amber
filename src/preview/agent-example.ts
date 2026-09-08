import type { Feed, Post } from '../domain/post'
import type {
  AgentConversation,
  AgentMemory,
  AgentMemoryEvent,
  AgentMessage,
  AgentRun,
  AgentRunStage,
  PostChange,
  PreviewRole,
} from './state'

export const AGENT_SCENARIOS = [
  ['rich-complete', 'Grounded two-turn result'],
  ['empty', 'Empty conversation'],
  ['incoming', 'Incoming requests'],
  ['resolved', 'Deferred and ignored'],
  ['answer-only', 'Answer, no post changes'],
  ['single-diff', 'Single post change'],
  ['multi-diff', 'Multiple post changes'],
  ['candidate-clarify', 'Candidate needs clarification'],
  ['candidate-publish', 'Candidate published'],
  ['memory-create', 'Preference created'],
  ['memory-update', 'Preference replaced'],
  ['memory-delete', 'Preference deleted'],
  ['history-memory', 'Older history and memory used'],
  ['stage-planning', 'Active: planning queries'],
  ['stage-retrieving', 'Active: retrieving context'],
  ['stage-generating', 'Active: generating answer'],
  ['stage-publishing', 'Active: atomic update'],
  ['stage-background-both', 'Active: both background jobs'],
  ['stage-background-memory', 'Active: memory remaining'],
  ['stage-background-addressing', 'Active: addressing remaining'],
  ['failure-before-publication', 'Failure before publication'],
  ['failure-memory', 'Memory failed, addressing done'],
  ['failure-addressing', 'Addressing failed, memory done'],
  ['failure-both', 'Both background jobs failed'],
  ['retry-exhausted', 'Background retry exhausted'],
  ['retry-stale', 'Retry superseded by newer turn'],
] as const

export type AgentScenarioId = (typeof AGENT_SCENARIOS)[number][0]

export type AgentScenario = {
  role: PreviewRole
  conversation: AgentConversation
  posts: readonly Post[]
}

const styleShort: AgentMemory = {
  id: 'style',
  text: 'Keep posts short and factual.',
  version: 1,
}
const styleDetailed: AgentMemory = {
  id: 'style',
  text: 'Prefer detailed factual posts.',
  version: 2,
}
const styleConcise: AgentMemory = {
  id: 'style',
  text: 'Prefer concise posts.',
  version: 3,
}
const platform: AgentMemory = {
  id: 'platform',
  text: 'Only mention macOS releases.',
  version: 3,
}

const memoryHistory: readonly AgentMemoryEvent[] = [
  { kind: 'created', id: 'style', after: styleShort.text },
  {
    kind: 'replaced',
    id: 'style',
    before: styleShort.text,
    after: styleDetailed.text,
  },
  { kind: 'deleted', id: 'platform', before: platform.text },
  {
    kind: 'replaced',
    id: 'style',
    before: styleDetailed.text,
    after: styleConcise.text,
  },
]

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
  id: string,
  project: string,
  mark: string,
  summary: string,
  detail: string,
): Post {
  return {
    ...source,
    id,
    project,
    mark,
    title: project,
    summary,
    detail,
    time: 'Just now',
    comments: [],
  }
}

function fixturePosts(feed: Feed) {
  const noted =
    feed.posts.find((post) => post.id === 'voice-notes') ?? feed.posts[0]
  const source = feed.posts.find((post) => post.author === 'alex') ?? noted
  if (!noted || !source)
    return {
      initial: feed.posts,
      final: feed.posts,
      byId: {} as Record<string, Post>,
    }
  const initial = [
    ...feed.posts,
    projectPost(
      source,
      'atlas-preview',
      'Atlas',
      'a.',
      'A visual workspace for research.',
      'Atlas connects notes and sources.',
    ),
    projectPost(
      source,
      'aurora-preview',
      'Aurora',
      'au.',
      'A collaborative planning tool in public beta.',
      'Aurora helps teams plan launches. Public beta access is available.',
    ),
  ]
  const clipwise = projectPost(
    source,
    'clipwise-preview',
    'Clipwise',
    'c.',
    'A clipboard organizer.',
    'Clipwise is a free clipboard organizer licensed under the MIT license.',
  )
  return {
    initial,
    final: initial,
    byId: Object.fromEntries(
      [...initial, clipwise].map((post) => [post.id, post]),
    ),
    clipwise,
  }
}

function changed(
  postId: string,
  project: string,
  fields: PostChange['fields'],
  fromVersion: number,
  toVersion: number,
): PostChange {
  return { kind: 'updated', postId, project, fields, fromVersion, toVersion }
}

function created(post: Post): PostChange {
  return {
    kind: 'created',
    postId: post.id,
    project: post.project,
    fields: [
      { field: 'summary', before: '', after: post.summary },
      { field: 'detail', before: '', after: post.detail },
    ],
    toVersion: 1,
    post,
  }
}

function applyChanges(posts: readonly Post[], changes: readonly PostChange[]) {
  let next = [...posts]
  for (const change of changes) {
    if (change.kind === 'created' && change.post) {
      if (!next.some((post) => post.id === change.postId))
        next.push(change.post)
      continue
    }
    next = next.map((post) => {
      if (post.id !== change.postId) return post
      const patch = Object.fromEntries(
        change.fields.map((field) => [field.field, field.after]),
      )
      const { question: _question, ...rest } = post
      return { ...rest, ...patch }
    })
  }
  return next
}

function data(feed: Feed) {
  const posts = fixturePosts(feed)
  const noted = posts.byId['voice-notes']
  const atlas = posts.byId['atlas-preview']
  const aurora = posts.byId['aurora-preview']
  if (!noted || !atlas || !aurora || !posts.clipwise)
    return { posts, turnOne: [], turnTwo: [], allChanges: [] }
  const turnOne: readonly PostChange[] = [
    changed(
      noted.id,
      noted.project,
      [
        {
          field: 'detail',
          before: noted.detail,
          after:
            'Noted transcribes English and Mandarin voice notes on device.',
        },
      ],
      2,
      3,
    ),
    created(posts.clipwise),
  ]
  const notedAfterOne =
    applyChanges(posts.initial, turnOne).find((post) => post.id === noted.id) ??
    noted
  const turnTwo: readonly PostChange[] = [
    changed(
      atlas.id,
      atlas.project,
      [
        {
          field: 'summary',
          before: atlas.summary,
          after: 'An offline visual workspace for research.',
        },
        {
          field: 'detail',
          before: atlas.detail,
          after: 'Atlas connects notes and sources and works offline.',
        },
      ],
      4,
      5,
    ),
    changed(
      noted.id,
      noted.project,
      [
        {
          field: 'summary',
          before: notedAfterOne.summary,
          after: 'On-device voice transcription for macOS.',
        },
        {
          field: 'detail',
          before: notedAfterOne.detail,
          after:
            'Noted transcribes English and Mandarin voice notes on device. PDF export is planned for the next release.',
        },
      ],
      3,
      4,
    ),
    changed(
      aurora.id,
      aurora.project,
      [
        {
          field: 'summary',
          before: aurora.summary,
          after: 'An invite-only collaborative planning tool.',
        },
        {
          field: 'detail',
          before: aurora.detail,
          after: 'Aurora helps teams plan launches. Access is invite-only.',
        },
      ],
      1,
      2,
    ),
  ]
  return { posts, turnOne, turnTwo, allChanges: [...turnOne, ...turnTwo] }
}

function requests(): readonly AgentMessage[] {
  return [
    amber('request-license', 'Which license will Clipwise use?', {
      needsReply: true,
      intent: 'question',
      candidate: { name: 'Clipwise', status: 'pending' },
    }),
    amber('request-language', 'Does Noted support Mandarin?', {
      needsReply: true,
      intent: 'question',
      postId: 'voice-notes',
    }),
    amber('request-team', 'Should Atlas support team workspaces?', {
      needsReply: true,
      intent: 'suggestion',
      postId: 'atlas-preview',
    }),
    amber('request-exports', 'Which three export formats will Noted support?', {
      needsReply: true,
      intent: 'question',
      postId: 'voice-notes',
      deferred: true,
    }),
    amber('information-only', 'I indexed the latest project messages.', {
      intent: 'informational',
    }),
  ]
}

function richConversation(feed: Feed): AgentConversation {
  const { turnOne, turnTwo } = data(feed)
  const turnOneMemory = memoryHistory.slice(1, 3)
  const turnTwoMemory = memoryHistory.slice(3)
  const messages: AgentMessage[] = [
    user('history-aurora', 'Aurora should remain invite-only.'),
    amber('history-aurora-answer', 'Recorded for Aurora.'),
    user('history-style', 'Keep release details factual.'),
    amber('history-style-answer', 'I’ll keep release details factual.'),
    ...requests(),
    user(
      'live-turn-1:user',
      'Noted supports Mandarin. Clipwise uses the MIT license and is free, so publish it. Ignore the Atlas team-workspace suggestion. Prefer detailed factual posts and forget my macOS-only preference.',
    ),
    amber(
      'live-turn-1:assistant',
      'Noted now reflects Mandarin support, and Clipwise is published as free under the MIT license. I also set aside the Atlas team-workspace suggestion.',
      {
        changes: turnOne,
        memoryEvents: turnOneMemory,
        usedMemories: [styleShort, platform],
      },
    ),
    user(
      'live-turn-2:user',
      'Update Atlas to say it works offline and Noted to emphasize on-device transcription. PDF export is planned for the next release; defer the other export formats. Aurora should stay invite-only, as I said before. I no longer want detailed posts; keep them concise.',
    ),
    amber(
      'live-turn-2:assistant',
      'Atlas now states that it works offline. Noted emphasizes on-device transcription and marks PDF export as planned. Aurora is invite-only. I’ll keep posts concise.',
      {
        changes: turnTwo,
        memoryEvents: turnTwoMemory,
        usedHistory: ['Aurora should remain invite-only.'],
        usedMemories: [styleDetailed],
      },
    ),
  ]
  return {
    draft: '',
    messages: messages.map((message) => {
      if (['request-license', 'request-language'].includes(message.id))
        return {
          ...message,
          resolution: 'answered',
          addressedBy: 'live-turn-1:user',
        }
      if (message.id === 'request-team')
        return {
          ...message,
          resolution: 'ignored',
          addressedBy: 'live-turn-1:user',
        }
      return message
    }),
    memories: [styleConcise],
    memoryHistory,
    readThrough: messages.length - 1,
    revision: 0,
    run: completeRun('live-turn-2:user'),
  }
}

const outcome = (feed: Feed) => {
  const { turnTwo } = data(feed)
  return {
    responseId: 'preview-turn:assistant',
    text: 'I updated Atlas to say it works offline and kept the wording concise.',
    changes: turnTwo.slice(0, 1),
    memoryEvents: [
      {
        kind: 'replaced' as const,
        id: 'style',
        before: styleDetailed.text,
        after: styleConcise.text,
      },
    ],
    addressIds: ['request-offline'],
  }
}

function activeRun(feed: Feed, stage: AgentRunStage): AgentRun {
  const background = stage === 'background'
  return {
    messageId: 'preview-turn:user',
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

function completeRun(messageId: string): AgentRun {
  return {
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
  }
}

function baseConversation(
  messages: readonly AgentMessage[],
  memories: readonly AgentMemory[] = [styleDetailed],
): AgentConversation {
  return {
    draft: '',
    messages,
    memories,
    memoryHistory: memoryHistory.slice(0, 2),
    readThrough: messages.length,
    revision: 0,
  }
}

export function buildAgentScenario(
  feed: Feed,
  id: AgentScenarioId,
): AgentScenario {
  const fixture = data(feed)
  const rich = richConversation(feed)
  if (id === 'rich-complete')
    return {
      role: 'author',
      conversation: rich,
      posts: applyChanges(fixture.posts.initial, fixture.allChanges),
    }
  if (id === 'empty')
    return {
      role: 'author',
      conversation: baseConversation([], []),
      posts: fixture.posts.initial,
    }
  if (id === 'incoming')
    return {
      role: 'author',
      conversation: baseConversation(requests(), [styleShort, platform]),
      posts: fixture.posts.initial,
    }
  if (id === 'resolved') {
    const messages = requests().map((message) =>
      message.id === 'request-team'
        ? {
            ...message,
            resolution: 'ignored' as const,
            addressedBy: 'resolution:user',
          }
        : message,
    )
    return {
      role: 'author',
      conversation: baseConversation(messages),
      posts: fixture.posts.initial,
    }
  }
  const question = amber('request-language', 'Does Noted support Mandarin?', {
    needsReply: true,
    intent: 'question',
    postId: 'voice-notes',
  })
  const offlineQuestion = amber('request-offline', 'Does Atlas work offline?', {
    needsReply: true,
    intent: 'question',
    postId: 'atlas-preview',
  })
  const answerOnly = [
    question,
    user('answer:user', 'Yes, it supports Mandarin.'),
    amber('answer:assistant', 'Thanks. Noted supports Mandarin.', {
      addressedBy: undefined,
    }),
  ]
  if (id === 'answer-only')
    return {
      role: 'author',
      conversation: baseConversation(
        answerOnly.map((message) =>
          message.id === question.id
            ? { ...message, resolution: 'answered', addressedBy: 'answer:user' }
            : message,
        ),
      ),
      posts: fixture.posts.initial,
    }
  const response = (
    changes: readonly PostChange[],
    extra: Partial<AgentMessage> = {},
  ) => [
    user('change:user', 'Apply these facts to my posts.'),
    amber('change:assistant', 'Applied the supported changes.', {
      changes,
      ...extra,
    }),
  ]
  if (id === 'single-diff')
    return {
      role: 'author',
      conversation: baseConversation(response(fixture.turnOne.slice(0, 1))),
      posts: applyChanges(fixture.posts.initial, fixture.turnOne.slice(0, 1)),
    }
  if (id === 'multi-diff')
    return {
      role: 'author',
      conversation: baseConversation(response(fixture.turnTwo)),
      posts: applyChanges(fixture.posts.initial, fixture.turnTwo),
    }
  if (id === 'candidate-clarify')
    return {
      role: 'author',
      conversation: baseConversation([
        user('clarify:user', 'Publish Clipwise. It is free.'),
        amber('clarify:assistant', 'Which license does Clipwise use?', {
          needsReply: true,
          intent: 'question',
          candidate: { name: 'Clipwise', status: 'clarification' },
        }),
      ]),
      posts: fixture.posts.initial,
    }
  if (id === 'candidate-publish') {
    const change = fixture.turnOne.slice(1)
    return {
      role: 'author',
      conversation: baseConversation(
        response(change, {
          candidate: { name: 'Clipwise', status: 'published' },
        }),
      ),
      posts: applyChanges(fixture.posts.initial, change),
    }
  }
  const eventById: Record<string, AgentMemoryEvent> = {
    'memory-create': memoryHistory[0],
    'memory-update': memoryHistory[1],
    'memory-delete': memoryHistory[2],
  }
  if (id in eventById) {
    const event = eventById[id]
    const memories =
      id === 'memory-delete'
        ? [styleDetailed]
        : id === 'memory-update'
          ? [styleDetailed]
          : [styleShort]
    return {
      role: 'author',
      conversation: {
        ...baseConversation(
          [
            user(
              `${id}:user`,
              id === 'memory-delete'
                ? 'Forget my macOS-only preference.'
                : (event.after ?? ''),
            ),
            amber(`${id}:assistant`, 'Got it.', { memoryEvents: [event] }),
          ],
          memories,
        ),
        memoryHistory: [event],
      },
      posts: fixture.posts.initial,
    }
  }
  if (id === 'history-memory')
    return {
      role: 'author',
      conversation: baseConversation(
        [
          user(
            'history:user',
            'Keep Aurora consistent with what I said before.',
          ),
          amber(
            'history:assistant',
            'Aurora remains invite-only, with concise factual copy.',
            {
              usedHistory: ['Aurora should remain invite-only.'],
              usedMemories: [styleConcise],
            },
          ),
        ],
        [styleConcise],
      ),
      posts: fixture.posts.initial,
    }
  if (id.startsWith('stage-')) {
    const stageMap: Partial<Record<AgentScenarioId, AgentRunStage>> = {
      'stage-planning': 'planning',
      'stage-retrieving': 'retrieving',
      'stage-generating': 'generating',
      'stage-publishing': 'publishing',
      'stage-background-both': 'background',
      'stage-background-memory': 'background',
      'stage-background-addressing': 'background',
    }
    const stage = stageMap[id] ?? 'planning'
    const run = activeRun(feed, stage)
    if (id === 'stage-background-memory') {
      run.memory = 'running'
      run.addressing = 'done'
    }
    if (id === 'stage-background-addressing') {
      run.memory = 'done'
      run.addressing = 'running'
    }
    const published = stage === 'background'
    let messages = [
      offlineQuestion,
      user(
        'preview-turn:user',
        'Update Atlas to say it works offline and keep posts concise.',
      ),
    ]
    if (published)
      messages.push(
        amber('preview-turn:assistant', outcome(feed).text, {
          changes: outcome(feed).changes,
        }),
      )
    if (run.memory === 'done')
      messages = messages.map((message) =>
        message.id === 'preview-turn:assistant'
          ? { ...message, memoryEvents: outcome(feed).memoryEvents }
          : message,
      )
    if (run.addressing === 'done')
      messages = messages.map((message) =>
        message.id === offlineQuestion.id
          ? {
              ...message,
              resolution: 'answered' as const,
              addressedBy: 'preview-turn:user',
            }
          : message,
      )
    const conversation = baseConversation(
      messages,
      run.memory === 'done' ? [styleConcise] : [styleDetailed],
    )
    return {
      role: 'author',
      conversation: {
        ...conversation,
        memoryHistory:
          run.memory === 'done'
            ? [...conversation.memoryHistory, ...outcome(feed).memoryEvents]
            : conversation.memoryHistory,
        run,
      },
      posts: published
        ? applyChanges(fixture.posts.initial, outcome(feed).changes)
        : fixture.posts.initial,
    }
  }
  if (id === 'failure-before-publication') {
    const run = activeRun(feed, 'generating')
    run.status = 'failed'
    run.error = 'I couldn’t prepare a supported answer. Nothing was published.'
    return {
      role: 'author',
      conversation: {
        ...baseConversation([
          user('preview-turn:user', 'Update Atlas with the new detail.'),
        ]),
        run,
      },
      posts: fixture.posts.initial,
    }
  }
  const failureRun = activeRun(feed, 'complete')
  failureRun.status = 'complete'
  failureRun.published = true
  failureRun.memory = id === 'failure-addressing' ? 'done' : 'failed'
  failureRun.addressing = id === 'failure-memory' ? 'done' : 'failed'
  failureRun.memoryAttempts = id === 'retry-exhausted' ? 2 : 1
  failureRun.addressingAttempts = id === 'retry-exhausted' ? 2 : 1
  if (id === 'retry-exhausted') {
    failureRun.memory = 'exhausted'
    failureRun.addressing = 'done'
  }
  if (id === 'retry-stale') {
    failureRun.memory = 'failed'
    failureRun.addressing = 'done'
    failureRun.stale = true
  }
  let failedMessages = [
    offlineQuestion,
    user(
      'preview-turn:user',
      'Update Atlas to say it works offline and keep posts concise.',
    ),
    amber('preview-turn:assistant', outcome(feed).text, {
      changes: outcome(feed).changes,
    }),
  ]
  if (failureRun.memory === 'done')
    failedMessages = failedMessages.map((message) =>
      message.id === 'preview-turn:assistant'
        ? { ...message, memoryEvents: outcome(feed).memoryEvents }
        : message,
    )
  if (failureRun.addressing === 'done')
    failedMessages = failedMessages.map((message) =>
      message.id === offlineQuestion.id
        ? {
            ...message,
            resolution: 'answered' as const,
            addressedBy: 'preview-turn:user',
          }
        : message,
    )
  const conversation = baseConversation(
    failedMessages,
    failureRun.memory === 'done' ? [styleConcise] : [styleDetailed],
  )
  return {
    role: 'author',
    conversation: {
      ...conversation,
      memoryHistory:
        failureRun.memory === 'done'
          ? [...conversation.memoryHistory, ...outcome(feed).memoryEvents]
          : conversation.memoryHistory,
      run: failureRun,
    },
    posts: applyChanges(fixture.posts.initial, outcome(feed).changes),
  }
}

export function illustrativeRun(feed: Feed, messageId: string): AgentRun {
  return { ...activeRun(feed, 'planning'), messageId, autoPlay: true }
}

export function applyFixturePostChanges(
  posts: readonly Post[],
  changes: readonly PostChange[],
) {
  return applyChanges(posts, changes)
}
