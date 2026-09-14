import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'
import * as Action from '@smthrs/flow/Action'
import { Effect, Layer, Schema } from 'effect'
import type { Model, ModelObservation } from '../../shared/runtime'
import { testEngine } from '../../shared/test-engine'
import { telegramLayers } from '../agents'
import * as S from '../schemas'
import { telegramStore } from '../testing/store'
import { TelegramBatch } from '../workflow'
import type { Snapshot } from './snapshot'

export type ImportSnapshot = Snapshot
export type State = ReturnType<ReturnType<typeof telegramStore>['snapshot']>
type Result = ReturnType<ReturnType<typeof telegramStore>['result']>
export type ImportCall = {
  task: string
  instruction: string
  input: unknown
  outputSchema: unknown
  tools: readonly string[]
  observations: unknown[]
  status: 'running' | 'succeeded' | 'failed'
  output?: unknown
  error?: string
  reusedFromBatch?: number
}
export type ImportBatch = {
  input: typeof S.BatchContext.Type
  calls: ImportCall[]
  status: 'running' | 'completed' | 'failed'
  result?: Result
  error?: string
}
export type ImportRun = {
  snapshotHash: string
  groupId: string
  completedMessages: number
  skipped: { messageId: string; reason: string }[]
  state: State
  batches: ImportBatch[]
}
const emptyState = (): State => ({
  posts: [],
  candidates: [],
  pendingRequests: [],
  sources: {},
  associations: {},
})
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

// One local importer holds the lock. A batch's state and cursor commit in one rename.
// An interrupted batch may spend tokens again, but cannot publish twice.
export async function runImport(
  snapshot: ImportSnapshot,
  options: {
    model: Model
    directory: string
    batchSize?: number
    onProgress?: (run: ImportRun) => void
  },
): Promise<ImportRun> {
  const batchSize = options.batchSize ?? 100
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 100)
    throw new Error('Batch size must be 1–100.')
  Schema.decodeUnknownSync(S.Id)(snapshot.groupId)
  const skipped = snapshot.messages.flatMap((message) => {
    const reason = message.service
      ? 'Telegram service event'
      : !message.text.trim()
        ? 'No text; media is not analyzed'
        : message.text.length > 8000
          ? 'Text exceeds 8000-character workflow limit'
          : null
    return reason ? [{ messageId: message.id, reason }] : []
  })
  const skippedIds = new Set(skipped.map(({ messageId }) => messageId))
  const messages = snapshot.messages
    .filter(({ id }) => !skippedIds.has(id))
    .map((message) => Schema.decodeUnknownSync(S.TelegramMessage)(message))
  if (
    snapshot.messages.length > 500 ||
    new Set(snapshot.messages.map(({ id }) => id)).size !== snapshot.messages.length
  )
    throw new Error('Snapshot must contain at most 500 unique messages in chronological order.')
  const dates = snapshot.messages.map(({ date }) => Date.parse(date))
  if (
    dates.some(
      (date, index) => !Number.isFinite(date) || (index > 0 && date < (dates[index - 1] ?? date)),
    )
  )
    throw new Error('Snapshot messages must have valid dates and be oldest first.')
  const snapshotHash = createHash('sha256')
    .update(JSON.stringify({ ...snapshot, messages }))
    .digest('hex')
  await mkdir(options.directory, { recursive: true, mode: 0o700 })
  const lock = join(options.directory, 'import.lock')
  await mkdir(lock).catch(() => {
    throw new Error(
      'An import is running or was interrupted. Verify it stopped before removing import.lock.',
    )
  })
  const path = join(options.directory, 'import.json')
  let writes = Promise.resolve()
  const save = (run: ImportRun) => {
    const json = JSON.stringify(run, null, 2)
    writes = writes.then(async () => {
      await writeFile(`${path}.tmp`, json, { mode: 0o600 })
      await rename(`${path}.tmp`, path)
    })
    return writes
  }
  try {
    const saved = await readFile(path, 'utf8').catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    const run: ImportRun = saved
      ? JSON.parse(saved)
      : {
          snapshotHash,
          groupId: snapshot.groupId,
          completedMessages: 0,
          skipped,
          state: emptyState(),
          batches: [],
        }
    if (run.snapshotHash !== snapshotHash)
      throw new Error('This checkpoint belongs to another snapshot. Use a new import directory.')
    await save(run)
    for (let offset = run.completedMessages; offset < messages.length; offset += batchSize) {
      const fresh = messages.slice(offset, offset + batchSize)
      const history = messages.slice(0, offset + fresh.length)
      const replyIds = new Set(fresh.flatMap(({ replyToId }) => (replyToId ? [replyToId] : [])))
      const freshIds = new Set(fresh.map(({ id }) => id))
      const nearbyIds = new Set(
        messages.slice(Math.max(0, offset - 15), offset).map(({ id }) => id),
      )
      const context = history.filter(
        ({ id }) => freshIds.has(id) || replyIds.has(id) || nearbyIds.has(id),
      )
      const targets = new Map<string, { targetKind: 'post' | 'candidate'; ownerId: string }>([
        ...run.state.posts.map(
          (post) => [post.id, { targetKind: 'post' as const, ownerId: post.authorId }] as const,
        ),
        ...run.state.candidates.map(
          (candidate) =>
            [
              candidate.id,
              { targetKind: 'candidate' as const, ownerId: candidate.authorId },
            ] as const,
        ),
      ])
      const batch: typeof S.BatchContext.Type = {
        batchId: `import-${snapshotHash.slice(0, 12)}-${offset}`,
        groupId: snapshot.groupId,
        messages: context,
        newMessageIds: [...freshIds],
        associations: Object.entries(run.state.associations)
          .flatMap(([messageId, ids]) =>
            context.some(({ id }) => id === messageId)
              ? ids.flatMap((targetId) => {
                  const target = targets.get(targetId)
                  return target ? [{ messageId, targetId, ...target }] : []
                })
              : [],
          )
          .slice(0, 100),
      }
      const store = telegramStore(batch, run.state.posts, {
        ...run.state,
        history,
        memories: {},
        ownerNames: Object.fromEntries(
          Object.entries(snapshot.authors).map(([id, author]) => [id, author.name]),
        ),
        projectGroups: Object.fromEntries([...targets.keys()].map((id) => [id, snapshot.groupId])),
      })
      const attempt: ImportBatch = { input: batch, calls: [], status: 'running' }
      run.batches.push(attempt)
      await save(run)
      const model: Model = (request) =>
        Effect.tryPromise({
          try: async () => {
            const call: ImportCall = {
              task: request.task,
              instruction: request.instruction,
              input: request.input,
              outputSchema: request.outputSchema,
              tools: [...request.tools.map(({ name }) => name), ...request.nativeTools],
              observations: [],
              status: 'running',
            }
            attempt.calls.push(call)
            await save(run)
            try {
              const previousIndex =
                request.task === 'selection'
                  ? run.batches.findIndex(
                      (prior) =>
                        prior !== attempt &&
                        isDeepStrictEqual(prior.input, batch) &&
                        prior.calls.some(
                          (old) =>
                            old.task === call.task &&
                            old.status === 'succeeded' &&
                            old.instruction === call.instruction &&
                            isDeepStrictEqual(old.outputSchema, call.outputSchema) &&
                            isDeepStrictEqual(old.tools, call.tools),
                        ),
                    )
                  : -1
              const previous =
                previousIndex < 0
                  ? undefined
                  : run.batches[previousIndex]?.calls.find(
                      (old) => old.task === 'selection' && old.status === 'succeeded',
                    )
              if (previous) {
                for (const raw of previous.observations) {
                  const observation = raw as Record<string, unknown>
                  if (observation.kind === 'tool') {
                    const current = await Effect.runPromise(
                      request.callTool(String(observation.name), observation.input),
                    )
                    if (!isDeepStrictEqual(current, observation.output))
                      throw new Error('Saved selection lookup changed; cannot reuse it.')
                  } else await Effect.runPromise(request.observe(raw as ModelObservation))
                }
                call.output = previous.output
                call.observations = previous.observations
                call.reusedFromBatch = previousIndex
                call.status = 'succeeded'
                await save(run)
                return call.output
              }
              call.output = await Effect.runPromise(
                options.model({
                  ...request,
                  callTool: (name, input) =>
                    request.callTool(name, input).pipe(
                      Effect.tap((output) =>
                        Effect.promise(async () => {
                          call.observations.push({ kind: 'tool', name, input, output })
                          await save(run)
                        }),
                      ),
                    ),
                  observe: (observation) =>
                    request.observe(observation).pipe(
                      Effect.andThen(
                        Effect.promise(async () => {
                          call.observations.push(observation)
                          await save(run)
                        }),
                      ),
                    ),
                }),
              )
              call.status = 'succeeded'
              await save(run)
              return call.output
            } catch (error) {
              call.status = 'failed'
              call.error = errorMessage(error)
              await save(run)
              throw error
            }
          },
          catch: (error) =>
            new S.Failure({ operation: 'import-model', message: errorMessage(error) }),
        })
      try {
        const host = telegramLayers({ ...store.ports, model }).pipe(
          Layer.provideMerge(Action.layerImplementations),
          Layer.provideMerge(testEngine),
        )
        const receipt = await Effect.runPromise(
          TelegramBatch.execute(batch, {
            executionId: `${batch.batchId}-attempt-${run.batches.length}`,
          }).pipe(Effect.provide(host)),
        )
        attempt.result = store.result()
        if (!receipt.completed)
          throw new Error(
            `Batch needs review: ${store.retries.join('; ') || 'incomplete project execution'}`,
          )
        run.state = store.snapshot()
        run.completedMessages = offset + fresh.length
        attempt.status = 'completed'
        await save(run)
        options.onProgress?.(run)
      } catch (error) {
        attempt.result = store.result()
        attempt.status = 'failed'
        attempt.error = errorMessage(error)
        await save(run)
        throw error
      }
    }
    return run
  } finally {
    try {
      await writes
    } finally {
      await rm(lock, { recursive: true, force: true })
    }
  }
}
