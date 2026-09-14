import { randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import * as Action from '@smthrs/flow/Action'
import { Effect, Layer, Schema } from 'effect'
import { piOpenRouter } from '../../shared/pi'
import type { Model } from '../../shared/runtime'
import { testEngine } from '../../shared/test-engine'
import type { ImportCall, ImportRun } from '../../telegram/live/import'
import { messagingLayers } from '../agents'
import * as S from '../schemas'
import { messagingStore } from '../testing/store'
import { MessagingTurn } from '../workflow'

type State = ReturnType<ReturnType<typeof messagingStore>['snapshot']>
export type MessagingCapture = {
  snapshotHash: string
  state: State
  turns: {
    input: typeof S.TurnInput.Type
    calls: ImportCall[]
    receipt: typeof S.TurnReceipt.Type
    progress: ReturnType<typeof messagingStore>['progress']
  }[]
}

export function initialMessagingState(run: ImportRun) {
  const messages: (typeof S.Message.Type)[] = run.state.pendingRequests.map((request, index) => ({
    id: request.id,
    userId: request.ownerId,
    conversationId: `conversation:${request.ownerId}`,
    sequence: index + 1,
    text: request.text,
    role: 'assistant',
    turnId: null,
    intent: request.intent,
    linkedPostId: request.linkedPostId,
    pendingCandidateId: request.pendingCandidateId,
    addressed: request.addressed,
  }))
  for (const batch of run.batches.filter((batch) => batch.status === 'completed')) {
    for (const notification of batch.result?.notifications ?? []) {
      messages.push({
        id: notification.id,
        userId: notification.authorId,
        conversationId: `conversation:${notification.authorId}`,
        sequence: messages.length + 1,
        text: notification.text,
        role: 'assistant',
        turnId: null,
        intent: 'informational',
        linkedPostId: null,
        pendingCandidateId: null,
        addressed: true,
      })
    }
  }
  return messagingStore({
    posts: run.state.posts.map((post) => ({ ...post, published: true })),
    candidates: run.state.candidates.map((candidate) => ({
      ...candidate,
      userId: candidate.authorId,
      status: 'pending' as const,
    })),
    memories: [],
    messages,
  }).snapshot()
}

export async function runReply(
  raw: { authorId: string; text: string },
  options: { directory: string; model: Model; emit?: (value: unknown) => void },
) {
  const input = Schema.decodeUnknownSync(S.TurnInput)({
    userId: raw.authorId,
    text: raw.text,
    turnId: randomUUID(),
  })
  const lock = resolve(options.directory, 'import/import.lock')
  await mkdir(lock).catch(() => {
    throw new Error('An import or message is already running.')
  })
  const path = resolve(options.directory, 'messaging.json')
  try {
    const run: ImportRun = JSON.parse(
      await readFile(resolve(options.directory, 'import/import.json'), 'utf8'),
    )
    const snapshot = JSON.parse(
      await readFile(resolve(options.directory, 'snapshot.json'), 'utf8'),
    ) as { messages: unknown[] }
    if (
      run.completedMessages !== snapshot.messages.length - run.skipped.length ||
      run.batches.some((batch) => batch.status === 'running')
    )
      throw new Error('Finish the import first.')
    const saved = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    const capture: MessagingCapture = saved
      ? JSON.parse(saved)
      : {
          snapshotHash: run.snapshotHash,
          state: initialMessagingState(run),
          turns: [],
        }
    if (capture.snapshotHash !== run.snapshotHash)
      throw new Error('Conversation belongs to a different import.')
    const known =
      capture.state.posts.some((post) => post.authorId === input.userId) ||
      capture.state.candidates.some((candidate) => candidate.userId === input.userId) ||
      capture.state.messages.some((message) => message.userId === input.userId)
    if (!known) throw new Error('Choose an author from this import.')
    const store = messagingStore({
      ...capture.state,
      completedTurns: capture.turns
        .filter((turn) => turn.receipt.status === 'completed' && turn.receipt.assistantMessageId)
        .map((turn) => ({
          turnId: turn.input.turnId,
          userMessageId:
            capture.state.messages.find(
              (message) => message.turnId === turn.input.turnId && message.role === 'user',
            )?.id ?? '',
          assistantMessageId: turn.receipt.assistantMessageId as string,
        })),
    })
    const calls: ImportCall[] = []
    const model: Model = (request) => {
      const call: ImportCall = {
        task: request.task,
        instruction: request.instruction,
        input: request.input,
        outputSchema: request.outputSchema,
        tools: [...request.tools.map((tool) => tool.name), ...request.nativeTools],
        observations: [],
        status: 'running',
      }
      calls.push(call)
      options.emit?.({ type: 'task', task: request.task, status: 'running' })
      return options
        .model({
          ...request,
          observe: (observation) =>
            request.observe(observation).pipe(
              Effect.tap(() =>
                Effect.sync(() => {
                  call.observations.push(observation)
                }),
              ),
            ),
        })
        .pipe(
          Effect.tap((output) =>
            Effect.sync(() => {
              call.output = output
              call.status = 'succeeded'
              options.emit?.({ type: 'task', task: request.task, status: 'done' })
            }),
          ),
          Effect.tapError((error) =>
            Effect.sync(() => {
              call.status = 'failed'
              call.error = error.message
            }),
          ),
        )
    }
    const host = messagingLayers({ ...store.ports, model }).pipe(
      Layer.provideMerge(Action.layerImplementations),
      Layer.provideMerge(testEngine),
    )
    const receipt = await Effect.runPromise(
      MessagingTurn.execute(input, { executionId: input.turnId }).pipe(
        Effect.provide(host),
        Effect.timeout('10 minutes'),
      ),
    )
    capture.state = store.snapshot()
    capture.turns.push({ input, calls, receipt, progress: store.progress })
    await writeFile(`${path}.tmp`, JSON.stringify(capture, null, 2), { mode: 0o600 })
    await rename(`${path}.tmp`, path)
    options.emit?.({ type: 'done', status: receipt.status })
    if (receipt.status === 'failed')
      throw new Error('The messaging workflow failed. Details are saved locally.')
    return capture
  } finally {
    await rm(lock, { recursive: true, force: true })
  }
}

if (process.argv[1] === import.meta.filename) {
  let data = ''
  for await (const chunk of process.stdin) {
    data += chunk
    if (data.length > 12_000) throw new Error('Message input is too long.')
  }
  await runReply(JSON.parse(data), {
    directory: resolve(import.meta.dirname, '../../../.amber/telegram'),
    model: piOpenRouter,
    emit: (event) => console.log(JSON.stringify(event)),
  })
}
