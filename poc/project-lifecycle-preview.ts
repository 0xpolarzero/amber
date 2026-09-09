import { readFile, writeFile } from 'node:fs/promises'
import { projectReplyCalls } from './preview-projection.ts'

// Capture records cross the JSON boundary and are validated below by stage identity.
// biome-ignore lint/suspicious/noExplicitAny: JSON capture fields vary by workflow task.
type RecordValue = Record<string, any>

const captureUrl = new URL(
  process.env.AMBER_CAPTURE_FILE ?? './amber-lifecycle-results.json',
  import.meta.url,
)
const capture = JSON.parse(await readFile(captureUrl, 'utf8')) as RecordValue
const create = capture.stages.telegramCreate
const update = capture.stages.telegramEvidence
const privateReply = capture.stages.privateReply
if (!create || !update || !privateReply)
  throw new Error('The latest successful lifecycle capture is incomplete.')

const calls = new Map(capture.attempts.map((call: RecordValue) => [call.id, call]))
const stageCalls = (stage: RecordValue) =>
  stage.calls.map((id: string) => calls.get(id)).filter(Boolean) as RecordValue[]
const createCalls = stageCalls(create)
const updateCalls = stageCalls(update)
const privateCalls = stageCalls(privateReply)
const question = create.after.questions.find(({ authorId }: RecordValue) => authorId === 'maya')
if (!question) throw new Error('The lifecycle has no Maya question.')
const initialPost = create.after.posts.find(({ id }: RecordValue) => id === question.postId)
const updateDiff = update.after.diffs.find(({ postId }: RecordValue) => postId === question.postId)
const resolution = update.after.resolutions[question.id]
const notification = update.after.notifications.find(
  ({ authorId }: RecordValue) => authorId === question.authorId,
)
const selection = createCalls.find(({ task }) => task === 'selection')
const writer = createCalls.find(
  ({ task, input }) => task === 'post' && input.work.ownerId === question.authorId,
)
const updateSelection = updateCalls.find(({ task }) => task === 'selection')
const updateCandidate = updateSelection?.output.candidates.find(
  ({ target }: RecordValue) => target.targetId === question.postId,
)
if (
  !initialPost ||
  !updateDiff ||
  !resolution ||
  !notification ||
  !selection ||
  !writer ||
  !updateCandidate
)
  throw new Error('The lifecycle cannot resolve its coherent Orbit stages by identity.')

const privatePlanner = privateCalls.find(({ task }) => task === 'query-planner')
const privateResponder = privateCalls.find(({ task }) => task === 'responder')
const privateMemory = privateCalls.find(({ task }) => task === 'memory')
const privateAddressing = privateCalls.find(({ task }) => task === 'addressing')
if (!privatePlanner || !privateResponder || !privateMemory || !privateAddressing)
  throw new Error('The private lifecycle trace is incomplete.')
const replyTrace = projectReplyCalls(privateCalls as never)
const assistant = privateReply.after.messages.find(
  ({ id }: RecordValue) => id === privateReply.receipt.assistantMessageId,
)
if (!assistant) throw new Error('The private assistant output is missing.')
const admittedNotification = privateReply.before.messages.find(
  ({ id }: RecordValue) => id === notification.id,
)
if (!admittedNotification) throw new Error('The private Telegram notification is missing.')

const observedTools = (call: RecordValue) => [
  ...new Set(
    call.observations.flatMap((observation: RecordValue) =>
      observation.kind === 'configuration' ? (observation.observedTools ?? []) : [],
    ),
  ),
]
const selected = selection.output.candidates.find(
  ({ authorId }: RecordValue) => authorId === question.authorId,
)
const related = selection.output.candidates
  .filter(({ authorId }: RecordValue) => authorId !== question.authorId)
  .map((candidate: RecordValue) => {
    const post = create.after.posts.find(
      ({ authorId }: RecordValue) => authorId === candidate.authorId,
    )
    return {
      authorId: candidate.authorId,
      project: candidate.project,
      messageIds: candidate.messageIds,
      existingPosts: [],
      resultPost: { id: post.id, title: post.title, summary: post.summary },
      outcome: 'created',
    }
  })
const trace = {
  questionId: question.id,
  authorId: question.authorId,
  project: selected.project,
  selectedMessageIds: selected.messageIds,
  context: {
    existingPosts: [],
    memories: writer.input.memories,
    outstandingRequests: writer.input.pendingRequests,
    observedTools: observedTools(writer),
    observationScope: 'the selected Orbit writer branch',
  },
  publication: {
    post: {
      id: initialPost.id,
      title: initialPost.title,
      summary: initialPost.summary,
      detail: initialPost.detail,
    },
    output: {
      existingPostId: writer.output.postEdit.existingPostId,
      sources: writer.output.postEdit.sources,
    },
  },
  question: question.text,
  telegramUpdate: {
    batchId: update.input.batchId,
    groupId: update.input.groupId,
    project: updateCandidate.project,
    target: updateCandidate.target,
    recording: {
      model: capture.provenance.model,
      disclosure:
        'Synthetic Telegram and private messages processed by the real Gemini workflows. Replay timing is browser-only.',
    },
    selectedMessageIds: updateCandidate.messageIds,
    messages: update.input.messages,
    before: updateDiff.before,
    after: updateDiff.after,
    notification,
    resolution: {
      outcome: resolution.outcome,
      reason: resolution.reason,
      sourceIds: resolution.sources.map((source: RecordValue) => source.messageId ?? source.url),
    },
  },
  related,
  recording: {
    model: capture.provenance.model,
    disclosure:
      'Synthetic Telegram and private messages processed by the real Gemini workflows. Replay timing is browser-only.',
  },
}
const source = {
  disclosure: trace.recording.disclosure,
  batchId: create.input.batchId,
  groupId: create.input.groupId,
  messages: create.input.messages,
  outcomes: {
    posts: create.after.posts.map((post: RecordValue) => ({
      authorId: post.authorId,
      title: post.title,
      outcome: 'created',
      questionCount: create.after.questions.filter(({ postId }: RecordValue) => postId === post.id)
        .length,
    })),
    ignored: create.after.ignored,
  },
}
const messaging = {
  input: privateReply.input,
  assistant,
  notification: admittedNotification,
  diffs: privateReply.receipt.diffs,
  memoryOperations: privateMemory.output.operations,
  finalMemories: privateReply.after.memories.filter(
    ({ userId }: RecordValue) => userId === privateReply.input.userId,
  ),
  addressing: privateAddressing.output.resolutions,
  background: privateReply.receipt.background,
}
const questionProjection = { question, source, trace, replyTrace, messaging }
const realProjection = {
  version: 5,
  mode: 'recorded-real-model',
  model: capture.provenance.model,
  disclosure: trace.recording.disclosure,
  source: {
    file: capture.provenance.runFile,
    runId: capture.provenance.runId,
    provenance: capture.provenance,
    sourceHashes: privateReply.sourceHashes,
  },
  input: privateReply.input,
  assistant,
  posts: {
    before: privateReply.receipt.diffs.map(({ before }: RecordValue) => before),
    after: privateReply.receipt.diffs.map(({ after }: RecordValue) => after),
    diffs: privateReply.receipt.diffs,
  },
  memory: {
    before: privateReply.before.memories.filter(
      ({ userId }: RecordValue) => userId === privateReply.input.userId,
    ),
    after: privateReply.after.memories.filter(
      ({ userId }: RecordValue) => userId === privateReply.input.userId,
    ),
  },
  requests: {
    before: [
      {
        id: question.id,
        text: question.text,
        intent: 'question',
        linkedPostId: question.postId,
        role: 'assistant',
      },
    ],
    after: [],
  },
  background: privateReply.receipt.background,
  trace: replyTrace,
}

await Promise.all([
  writeFile(
    new URL('../src/preview/generated/amber-question-preview.ts', import.meta.url),
    `// Generated from ${capture.provenance.runFile} by poc/project-lifecycle-preview.ts.\nexport default ${JSON.stringify(questionProjection, null, 2)} as const\n`,
  ),
  writeFile(
    new URL('../src/preview/generated/amber-real-preview.ts', import.meta.url),
    `// Generated from ${capture.provenance.runFile} by poc/project-lifecycle-preview.ts.\nexport default ${JSON.stringify(realProjection, null, 2)} as const\n`,
  ),
])
