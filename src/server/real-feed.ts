import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import type { Feed } from '../domain/post'
import type {
  AgentConversation,
  AgentMessage,
  PostChange,
} from '../preview/state'

type Snapshot = {
  importedAt: string
  groupId: string
  groupName: string
  authors: Record<string, { name: string }>
  messages: {
    id: string
    authorId: string | null
    text: string
    date: string
    sourceUrl: string | null
  }[]
}
type StoredPost = {
  id: string
  authorId: string
  title: string
  summary: string
  detail: string
}
type Call = {
  task: string
  input: unknown
  output?: unknown
  observations: unknown[]
  status: string
  error?: string
}
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
const count = (value: unknown, noun: string, plural = `${noun}s`) =>
  Array.isArray(value)
    ? `${value.length} ${value.length === 1 ? noun : plural}`
    : null

function recordedStage(
  call: Call,
): NonNullable<AgentMessage['recordedTrace']>['stages'][number] {
  const output = record(call.output)
  const labels: Record<string, string> = {
    selection: 'Select projects',
    post: 'Prepare post and follow-up',
    'query-planner': 'Plan context search',
    responder: 'Prepare reply',
    respond: 'Prepare reply',
    memory: 'Review preferences',
    addressing: 'Review pending requests',
  }
  const details = [
    count(output.candidates, 'selected project'),
    count(output.ignored, 'ignored message'),
    count(output.unresolved, 'unresolved message'),
    count(output.queries, 'planned query', 'planned queries'),
    count(output.postChanges, 'proposed post change'),
    count(output.operations, 'proposed preference change'),
    count(output.resolutions, 'proposed request resolution'),
  ].filter(Boolean)
  const edit = record(output.postEdit)
  if (typeof edit.title === 'string') details.unshift(edit.title)
  if (output.question) details.push('Follow-up question prepared')
  if (typeof output.reason === 'string' && !details.length)
    details.push(output.reason)
  return {
    label: labels[call.task] ?? call.task,
    status:
      call.status === 'succeeded'
        ? 'complete'
        : call.status === 'failed'
          ? 'failed'
          : 'running',
    summary:
      call.status === 'failed'
        ? 'Model call failed'
        : call.status !== 'succeeded'
          ? 'Model call in progress'
          : details.join(' · ') || 'Model output recorded',
    detail: JSON.stringify(
      {
        task: call.task,
        input: call.input,
        tools: call.observations,
        output: call.output,
        error: call.error,
      },
      null,
      2,
    ),
  }
}

type RecordedMessage = {
  id: string
  authorId: string
  postId?: string | null
  text: string
  needsReply?: boolean
}
type Import = {
  snapshotHash: string
  completedMessages: number
  skipped?: { messageId: string; reason: string }[]
  state: {
    posts: StoredPost[]
    pendingRequests: { id: string; addressed: boolean }[]
    sources: Record<
      string,
      { kind: string; messageId?: string; url?: string }[]
    >
  }
  batches: {
    status: string
    input: { messages: Snapshot['messages'] }
    calls: Call[]
    result?: { questions: RecordedMessage[]; notifications: RecordedMessage[] }
  }[]
}
const emptyConversation = (): AgentConversation => ({
  draft: '',
  messages: [],
  memories: [],
  memoryHistory: [],
  readThrough: 0,
  revision: 0,
})

// Keep private captures outside the bundle. Missing captures preserve the fixture demo;
// invalid captures fail visibly rather than quietly showing fictional data.
export async function loadRealFeed(
  directory = resolve('.amber/telegram'),
): Promise<Feed | null> {
  const json = await readFile(
    resolve(directory, 'import/import.json'),
    'utf8',
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!json) return null
  const run = JSON.parse(json) as Import
  const snapshot = JSON.parse(
    await readFile(resolve(directory, 'snapshot.json'), 'utf8'),
  ) as Snapshot
  const messaging = await readFile(
    resolve(directory, 'messaging.json'),
    'utf8',
  ).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  const capture = messaging ? (JSON.parse(messaging) as Messaging) : undefined
  if (capture && capture.snapshotHash !== run.snapshotHash)
    throw new Error('Conversation capture belongs to another Telegram import.')
  return projectRealFeed(snapshot, run, capture)
}

type Messaging = {
  snapshotHash: string
  state: {
    posts: StoredPost[]
    memories: { id: string; userId: string; text: string; version: number }[]
    messages: {
      id: string
      userId: string
      text: string
      role: 'user' | 'assistant'
      intent: 'informational' | 'question' | 'request' | 'suggestion'
      linkedPostId: string | null
      addressed: boolean
      turnId: string | null
    }[]
  }
  turns: {
    input: { turnId: string }
    calls: Call[]
    receipt?: {
      diffs: {
        postId: string
        before: {
          title: string
          summary: string
          detail: string
          version: number
        }
        after: {
          title: string
          summary: string
          detail: string
          version: number
        }
      }[]
    }
  }[]
}
function recordedTurnStages(turn: Messaging['turns'][number]) {
  const stages = turn.calls.map(recordedStage)
  const diffs = turn.receipt?.diffs
  if (!diffs?.length) return stages
  const changes: PostChange[] = diffs.map(({ postId, before, after }) => ({
    kind: 'updated',
    postId,
    project: after.title,
    fromVersion: before.version,
    toVersion: after.version,
    fields: (['title', 'summary', 'detail'] as const)
      .filter((field) => before[field] !== after[field])
      .map((field) => ({ field, before: before[field], after: after[field] })),
  }))
  const responderIndex = turn.calls.reduce(
    (last, { task, status }, index) =>
      (task === 'responder' || task === 'respond') && status === 'succeeded'
        ? index
        : last,
    -1,
  )
  stages.splice(responderIndex < 0 ? stages.length : responderIndex + 1, 0, {
    label: 'Update posts',
    summary: `${changes.length} ${changes.length === 1 ? 'post updated' : 'posts updated'}`,
    status: 'complete',
    changes,
    detail: JSON.stringify({ diffs }, null, 2),
  })
  return stages
}

export function projectRealFeed(
  snapshot: Snapshot,
  run: Import,
  messaging?: Messaging,
): Feed {
  const people = Object.fromEntries(
    Object.entries(snapshot.authors).map(([id, author]) => [
      id,
      {
        name: author.name,
        initials: author.name
          .trim()
          .split(/\s+/)
          .slice(0, 2)
          .map((word) => Array.from(word)[0])
          .join('')
          .toUpperCase(),
        background: '#f2f0eb',
        color: '#635f55',
        bio: '',
      },
    ]),
  )
  const conversations: Record<string, AgentConversation> = Object.fromEntries(
    Object.keys(people).map((id) => [id, emptyConversation()]),
  )
  for (const batch of run.batches.filter(
    (batch) => batch.status === 'completed',
  )) {
    for (const message of [
      ...(batch.result?.questions ?? []),
      ...(batch.result?.notifications ?? []),
    ]) {
      const conversation = conversations[message.authorId]
      if (!conversation) continue
      const addressed = run.state.pendingRequests.find(
        ({ id }) => id === message.id,
      )?.addressed
      const recorded: AgentMessage = {
        id: message.id,
        sender: 'amber',
        text: message.text,
        postId: message.postId ?? undefined,
        intent: message.needsReply ? 'question' : 'informational',
        needsReply: Boolean(message.needsReply),
        ...(addressed ? { resolution: 'answered' as const } : {}),
        recordedTrace: {
          group: snapshot.groupName,
          model: 'DeepSeek V4.1 Flash · OpenRouter',
          stages: [
            {
              label: 'Read Telegram messages',
              summary: `${batch.input.messages.length} messages in this batch`,
              status: 'complete',
              detail: batch.input.messages
                .map(
                  (item) =>
                    `${people[item.authorId ?? '']?.name ?? 'Unknown'}: ${item.text}`,
                )
                .join('\n\n'),
            },
            ...batch.calls
              .filter((call) => {
                const input = record(call.input)
                if (!('work' in input)) return true
                if (record(input.work).ownerId !== message.authorId)
                  return false
                if (!message.postId) return true
                const work = record(input.work)
                const targetId =
                  record(input.selectedPost).id ??
                  record(input.selectedCandidate).id ??
                  work.candidateId
                return (
                  typeof targetId !== 'string' || targetId === message.postId
                )
              })
              .map(recordedStage),
          ],
        },
      }
      conversation.messages = [...conversation.messages, recorded]
    }
  }
  if (messaging) {
    for (const [ownerId, conversation] of Object.entries(conversations)) {
      const original = new Map(
        conversation.messages.map((message) => [message.id, message]),
      )
      conversation.memories = messaging.state.memories.filter(
        (memory) => memory.userId === ownerId,
      )
      conversation.messages = messaging.state.messages
        .filter((message) => message.userId === ownerId)
        .map((message): AgentMessage => {
          const turn = messaging.turns.find(
            (turn) => turn.input.turnId === message.turnId,
          )
          return {
            ...original.get(message.id),
            id: message.id,
            text: message.text,
            sender: message.role === 'assistant' ? 'amber' : 'user',
            intent: message.intent,
            postId: message.linkedPostId ?? undefined,
            needsReply:
              message.role === 'assistant' &&
              message.intent !== 'informational',
            resolution:
              message.role === 'assistant' &&
              message.addressed &&
              message.intent !== 'informational'
                ? 'answered'
                : undefined,
            ...(turn && message.role === 'assistant'
              ? {
                  recordedTrace: {
                    group: snapshot.groupName,
                    model: 'DeepSeek V4.1 Flash · OpenRouter',
                    stages: recordedTurnStages(turn),
                  },
                }
              : {}),
          }
        })
    }
  }
  const posts = (messaging?.state.posts ?? run.state.posts).map((post) => {
    const sources = run.state.sources[post.id] ?? []
    const telegram = sources.flatMap((source) =>
      source.messageId
        ? snapshot.messages.filter(({ id }) => id === source.messageId)
        : [],
    )
    const publishedAt = telegram[0]?.date ?? snapshot.importedAt
    return {
      id: post.id,
      author: post.authorId,
      publishedAt,
      group: snapshot.groupId,
      time: publishedAt.slice(0, 10),
      title: post.title,
      summary: post.summary,
      detail: post.detail,
      sourceUrl:
        telegram.find((message) => message.sourceUrl)?.sourceUrl ?? undefined,
      project: post.title,
      domain: '',
      mark: post.title.slice(0, 1),
      bookmarks: 0,
      comments: [],
    }
  })
  const ownerIds = new Set([
    ...posts.map((post) => post.author),
    ...Object.entries(conversations)
      .filter(([, conversation]) => conversation.messages.length)
      .map(([id]) => id),
  ])
  for (const id of Object.keys(conversations))
    if (!ownerIds.has(id)) delete conversations[id]
  return {
    groups: { [snapshot.groupId]: { name: snapshot.groupName } },
    people,
    posts,
    realDemo: {
      importComplete:
        run.completedMessages + (run.skipped?.length ?? 0) ===
          snapshot.messages.length &&
        !run.batches.some((batch) => batch.status === 'running'),
      importedAt: snapshot.importedAt,
      messageCount: snapshot.messages.length,
      processedCount: run.completedMessages,
      skippedCount: run.skipped?.length ?? 0,
      model: 'DeepSeek V4.1 Flash · OpenRouter',
      conversations,
    },
  }
}
