// Reproducible preview capture: real Gemini decisions over invented local records only.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import * as Action from '@smthrs/flow/Action'
import { Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import {
  type PreviewProjectionCapture,
  projectPreviewTrace,
  projectReplyTrace,
} from '../preview-projection'
import { antigravity, modelId } from '../shared/antigravity'
import { testEngine } from '../shared/test-engine'
import { telegramLayers } from '../telegram/agents'
import { batch, initialPosts, memories as telegramMemories } from '../telegram/testing/fixtures'
import { telegramStore } from '../telegram/testing/store'
import type { ModelObservation, Ports as TelegramPorts } from '../telegram/tools'
import { TelegramBatch } from '../telegram/workflow'
import { messagingLayers } from './agents'
import type * as S from './schemas'
import { messagingStore } from './testing/store'
import type { Ports as MessagingPorts } from './tools'
import { MessagingTurn } from './workflow'

const artifactUrl = new URL('../preview-result.json', import.meta.url)
const projectionUrl = new URL('../../src/preview/generated/amber-real-preview.ts', import.meta.url)
const turnInput = {
  turnId: 'preview-turn-1',
  userId: 'alex',
  text: 'Noted supports Mandarin. Keep my posts concise and factual.',
} as const
const sourceFiles = [
  '../telegram/workflow.ts',
  '../telegram/agents.ts',
  '../telegram/model.ts',
  '../telegram/schemas.ts',
  '../telegram/testing/fixtures.ts',
  '../telegram/testing/store.ts',
  '../telegram/prompts/selection.mdx',
  '../telegram/prompts/post.mdx',
  './workflow.ts',
  './agents.ts',
  './model.ts',
  './schemas.ts',
  './testing/store.ts',
  './prompts/query-planner.mdx',
  './prompts/responder.mdx',
  './prompts/memory.mdx',
  './prompts/addressing.mdx',
] as const

const configuration = (
  observation: ModelObservation,
): observation is Extract<ModelObservation, { kind: 'configuration' }> =>
  observation.kind === 'configuration'

const candidateAuthorId = (input: unknown) => {
  if (!input || typeof input !== 'object' || !('work' in input)) return undefined
  const work = input.work
  if (!work || typeof work !== 'object' || !('candidate' in work)) return undefined
  const candidate = work.candidate
  if (!candidate || typeof candidate !== 'object' || !('authorId' in candidate)) return undefined
  return typeof candidate.authorId === 'string' ? candidate.authorId : undefined
}

it('captures the guided preview from one real extraction batch and one real messaging turn', async () => {
  const extracted = telegramStore(batch, initialPosts)
  const extractionCalls: { task: string; input: unknown; output: unknown }[] = []
  const extractionObservations: {
    task: string
    authorId?: string
    observation: ModelObservation
  }[] = []
  const extractionModel: TelegramPorts['model'] = (request) =>
    antigravity({
      ...request,
      observe: (observation) =>
        request.observe(observation).pipe(
          Effect.tap(() =>
            Effect.sync(() =>
              extractionObservations.push({
                task: request.task,
                authorId: candidateAuthorId(request.input),
                observation,
              }),
            ),
          ),
        ),
    }).pipe(
      Effect.tap((output) =>
        Effect.sync(() =>
          extractionCalls.push({ task: request.task, input: request.input, output }),
        ),
      ),
    )
  const extractionHost = telegramLayers({ ...extracted.ports, model: extractionModel }).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(testEngine),
  )
  const extractionReceipt = await Effect.runPromise(
    TelegramBatch.execute(batch, { executionId: 'preview-extraction' }).pipe(
      Effect.provide(extractionHost),
      Effect.timeout('6 minutes'),
    ),
  )
  const extraction = extracted.result()

  const fixture = {
    posts: extraction.posts.map((post) => ({ ...post, published: true })),
    memories: (telegramMemories.alex ?? []).map((memory, index) => ({
      ...memory,
      userId: 'alex',
      version: index + 1,
    })),
  }
  const messaged = messagingStore(fixture)
  for (const [index, question] of extraction.questions.entries())
    messaged.admitAgentMessage({
      id: `preview-extracted-question-${index + 1}`,
      userId: question.authorId,
      text: question.text,
      intent: 'question',
      ...(question.postId ? { linkedPostId: question.postId } : {}),
    })
  const messagingCalls: { task: string; input: unknown; output: unknown }[] = []
  const messagingModel: MessagingPorts['model'] = (request) =>
    antigravity(request).pipe(
      Effect.tap((output) =>
        Effect.sync(() =>
          messagingCalls.push({ task: request.task, input: request.input, output }),
        ),
      ),
    )
  const messagingHost = messagingLayers({ ...messaged.ports, model: messagingModel }).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(testEngine),
  )
  const beforeTurn = messaged.snapshot()
  const messagingReceipt = await Effect.runPromise(
    MessagingTurn.execute(turnInput, { executionId: turnInput.turnId }).pipe(
      Effect.provide(messagingHost),
      Effect.timeout('6 minutes'),
    ),
  )
  const afterTurn = messaged.snapshot()
  const published = afterTurn.turns[turnInput.turnId]?.published
  if (!published) throw new Error('The recorded messaging turn did not publish an answer.')

  const sourceProvenance = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => {
        const body = await readFile(new URL(file, import.meta.url))
        return [file, `sha256:${createHash('sha256').update(body).digest('hex')}`]
      }),
    ),
  )
  const recordedAt = new Date().toISOString()
  const baseProjection = {
    version: 1,
    mode: 'recorded-real-model',
    model: modelId,
    recordedAt,
    disclosure:
      'Invented Telegram messages processed by the real Gemini extraction and messaging workflows. This preview is not connected to Telegram.',
    telegram: {
      batchId: batch.batchId,
      groupId: batch.groupId,
      messages: batch.messages,
      posts: extraction.posts,
      questions: extraction.questions.map(({ id: _id, ...question }, index) => ({
        id: `preview-extracted-question-${index + 1}`,
        ...question,
      })),
      ignored: extraction.ignored,
      diffs: extraction.diffs,
    },
    messaging: {
      input: turnInput,
      assistant: published.assistantMessage,
      diffs: published.diffs,
      memoryOperations:
        (
          messagingCalls.find(({ task }) => task === 'memory')?.output as
            | typeof S.MemoryPlan.Type
            | undefined
        )?.operations ?? [],
      finalMemories: afterTurn.memories.filter(({ userId }) => userId === turnInput.userId),
      addressing:
        (
          messagingCalls.find(({ task }) => task === 'addressing')?.output as
            | typeof S.AddressingPlan.Type
            | undefined
        )?.resolutions ?? [],
      background: messagingReceipt.background,
    },
  }
  const artifact = {
    mode: 'live-model',
    provenance: {
      model: modelId,
      provider: 'Google subscription through Antigravity CLI',
      syntheticInput: true,
      storage: 'Invented in-memory fixtures; no Telegram, database, or auth connection',
      recordedAt,
      sourceProvenance,
    },
    extraction: {
      input: batch,
      initialPosts,
      receipt: extractionReceipt,
      result: extraction,
      calls: extractionCalls,
      observations: extractionObservations,
      progress: extracted.progress,
    },
    messaging: {
      seededPosts: fixture.posts,
      seededQuestions: extraction.questions,
      input: turnInput,
      before: beforeTurn,
      receipt: messagingReceipt,
      calls: messagingCalls,
      observations: messaged.observations,
      progress: messaged.progress,
      after: afterTurn,
    },
    projection: baseProjection,
  }
  const projection = {
    ...baseProjection,
    version: 3,
    messaging: {
      ...baseProjection.messaging,
      trace: projectReplyTrace(artifact as unknown as PreviewProjectionCapture),
    },
    trace: projectPreviewTrace(artifact as unknown as PreviewProjectionCapture),
  }
  artifact.projection = projection
  // Persist first so any semantic assertion failure remains reviewable.
  await writeFile(artifactUrl, `${JSON.stringify(artifact, null, 2)}\n`)
  await writeFile(
    projectionUrl,
    `// Generated by \`pnpm preview:refresh\`. Do not edit by hand.\nexport default ${JSON.stringify(projection, null, 2)} as const\n`,
  )

  expect(extractionReceipt.completed).toBe(true)
  expect(extractionCalls).toHaveLength(3)
  expect(extraction.posts.map(({ authorId }) => authorId)).toEqual(['alex', 'bea'])
  expect(extraction.questions).toHaveLength(1)
  expect(extraction.questions[0]).toMatchObject({ authorId: 'alex', needsReply: true })
  expect(extraction.questions[0].text).toMatch(/Mandarin|language/i)
  expect(extraction.ignored.map(({ messageId }) => messageId).sort()).toEqual(
    expect.arrayContaining(['101']),
  )
  expect(extraction.diffs).toHaveLength(1)
  expect(
    extractionObservations.filter(({ observation }) => configuration(observation)),
  ).toHaveLength(3)
  expect(messagingReceipt.status).toBe('completed')
  expect(messagingCalls.map(({ task }) => task).sort()).toEqual([
    'addressing',
    'memory',
    'query-planner',
    'responder',
  ])
  expect(published.diffs).toHaveLength(1)
  expect(`${published.diffs[0].after.summary} ${published.diffs[0].after.detail}`).toMatch(
    /Mandarin/i,
  )
  expect(published.diffs[0].before.authorId).toBe('alex')
  expect(afterTurn.posts.find(({ authorId }) => authorId === 'bea')).toEqual(
    beforeTurn.posts.find(({ authorId }) => authorId === 'bea'),
  )
  expect(afterTurn.messages.find(({ id }) => id === 'preview-extracted-question-1')).toMatchObject({
    addressed: true,
  })
  expect(afterTurn.addressing['preview-extracted-question-1']?.outcome).toBe('answered')
  expect(afterTurn.memories.some(({ text }) => /concise|short/i.test(text))).toBe(true)
  expect(projection.messaging.trace.planner.queries).toEqual([])
  expect(projection.messaging.trace.context).toMatchObject({
    linkedRequestPostIds: ['batch-1:0'],
    userMessages: [],
    assistantMessages: [],
  })
  expect(projection.messaging.trace.context.posts).toHaveLength(1)
  expect(projection.messaging.trace.memory.operations).toEqual([])
  expect(projection.messaging.trace.addressing.resolutions).toEqual([
    expect.objectContaining({
      requestMessageId: 'preview-extracted-question-1',
      outcome: 'answered',
    }),
  ])
}, 750_000)
