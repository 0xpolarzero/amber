// Real Gemini lifecycle capture over long synthetic records and synchronized in-memory stores.
import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import * as Action from '@smthrs/flow/Action'
import { Effect, Layer } from 'effect'
import { expect, it, onTestFailed } from 'vitest'
import { antigravity, modelId } from '../shared/antigravity'
import type { ModelRequest } from '../shared/runtime'
import { testEngine } from '../shared/test-engine'
import { telegramLayers } from '../telegram/agents'
import { validateSelection } from '../telegram/guards'
import { createModelTasks } from '../telegram/model'
import selectionPrompt from '../telegram/prompts/selection.mdx?raw'
import * as TS from '../telegram/schemas'
import {
  heldOutBatch,
  longBatches,
  meaningfulStressMessageCount,
  stressBatches,
} from '../telegram/testing/long-conversations'
import { telegramStore } from '../telegram/testing/store'
import type { Ports as TelegramPorts } from '../telegram/tools'
import { TelegramBatch } from '../telegram/workflow'
import { messagingLayers } from './agents'
import * as S from './schemas'
import { messagingStore } from './testing/store'
import type { Ports as MessagingPorts } from './tools'
import { MessagingTurn } from './workflow'

const latestArtifactUrl = new URL('../amber-lifecycle-results.json', import.meta.url)
const coverageUrl = new URL('../amber-lifecycle-coverage.json', import.meta.url)
const runsDirectoryUrl = new URL('../amber-lifecycle-runs/', import.meta.url)
const sourceFiles = [
  '../telegram/schemas.ts',
  '../telegram/guards.ts',
  '../telegram/agents.ts',
  '../telegram/testing/store.ts',
  '../telegram/testing/long-conversations.ts',
  '../telegram/prompts/selection.mdx',
  '../telegram/prompts/post.mdx',
  './schemas.ts',
  './guards.ts',
  './agents.ts',
  './testing/store.ts',
  './prompts/query-planner.mdx',
  './prompts/responder.mdx',
  './prompts/memory.mdx',
  './prompts/addressing.mdx',
] as const

type Call = {
  id: string
  workflow: 'telegram' | 'private'
  task: string
  instruction: string
  input: unknown
  outputSchema: unknown
  declaredTools: readonly string[]
  status: 'running' | 'succeeded' | 'failed'
  output?: unknown
  failure?: string
  observations: unknown[]
}

it('records and semantically checks one coherent lifecycle from long Telegram batches through private reply', async () => {
  const recordedAt = new Date().toISOString()
  const runId = (process.env.AMBER_RUN_ID ?? `${recordedAt}-${process.pid}`).replace(
    /[^a-zA-Z0-9_.-]/g,
    '',
  )
  const artifactUrl = new URL(`${runId}.json`, runsDirectoryUrl)
  const resumeRunId = process.env.AMBER_RESUME_RUN
  const resumed = resumeRunId
    ? (JSON.parse(await readFile(new URL(`${resumeRunId}.json`, runsDirectoryUrl), 'utf8')) as {
        attempts: Call[]
        stages: Record<string, unknown>
      })
    : undefined
  const reusableStageNames = ['telegramCreate', 'telegramEvidence', 'privateReply'] as const
  const reusableCallIds = new Set(
    reusableStageNames.flatMap((name) => {
      const stage = resumed?.stages[name] as { calls?: string[] } | undefined
      return stage?.calls ?? []
    }),
  )
  const resumedStages = Object.fromEntries(
    reusableStageNames.flatMap((name) => {
      const stage = resumed?.stages[name]
      return stage
        ? [
            [
              name,
              {
                ...(structuredClone(stage) as Record<string, unknown>),
                reusedFrom: `poc/amber-lifecycle-runs/${resumeRunId}.json#stages.${name}`,
              },
            ],
          ]
        : []
    }),
  )
  const artifact: {
    mode: string
    provenance: Record<string, unknown>
    fixture: Record<string, unknown>
    attempts: Call[]
    stages: Record<string, unknown>
    inspection: Record<string, unknown>
    workflowFailures: { at: string; name: string; message: string }[]
  } = {
    mode: 'live-model',
    provenance: {
      model: modelId,
      provider: 'Google subscription through Antigravity CLI',
      scripted: false,
      storage: 'shared synchronized in-memory PoC; no process-restart or database durability claim',
      recordedAt,
      runId,
      runFile: `poc/amber-lifecycle-runs/${runId}.json`,
      ...(resumeRunId
        ? {
            resumedFrom: `poc/amber-lifecycle-runs/${resumeRunId}.json`,
            reusedStages: reusableStageNames.filter((name) => resumed?.stages[name]),
          }
        : {}),
    },
    fixture: {},
    attempts: (resumed?.attempts ?? [])
      .filter(({ id }) => reusableCallIds.has(id))
      .map((call) => structuredClone(call)),
    stages: resumedStages,
    inspection: {},
    workflowFailures: [],
  }
  let saveSequence = 0
  let saveQueue = Promise.resolve()
  const enqueueAtomicWrite = (url: URL, body: string) => {
    const temporary = new URL(`${runId}.${++saveSequence}.tmp`, runsDirectoryUrl)
    saveQueue = saveQueue.then(async () => {
      await mkdir(runsDirectoryUrl, { recursive: true })
      await writeFile(temporary, body)
      await rename(temporary, url)
    })
    return saveQueue
  }
  const save = () => enqueueAtomicWrite(artifactUrl, `${JSON.stringify(artifact, null, 2)}\n`)
  onTestFailed(async ({ task }) => {
    const errors = task.result?.errors ?? []
    artifact.workflowFailures.push(
      ...errors.map((error) => ({
        at: new Date().toISOString(),
        name: error.name ?? 'Error',
        message: error.message,
      })),
    )
    await save()
  })
  const saveEffect = () =>
    Effect.tryPromise({
      try: save,
      catch: (error) => new S.Failure({ operation: 'save-live-artifact', message: String(error) }),
    })
  const capture = (workflow: Call['workflow']) => (request: ModelRequest) => {
    const call: Call = {
      id: `${workflow}-${artifact.attempts.length + 1}`,
      workflow,
      task: request.task,
      instruction: request.instruction,
      input: request.input,
      outputSchema: request.outputSchema,
      declaredTools: [...request.nativeTools, ...request.tools.map(({ name }) => name)],
      status: 'running',
      observations: [],
    }
    artifact.attempts.push(call)
    return saveEffect().pipe(
      Effect.andThen(
        antigravity({
          ...request,
          callTool: (name, input) =>
            request
              .callTool(name, input)
              .pipe(
                Effect.tap((output) =>
                  Effect.sync(() =>
                    call.observations.push({ kind: 'application-tool', name, input, output }),
                  ),
                ),
              ),
          observe: (observation) =>
            request
              .observe(observation)
              .pipe(Effect.tap(() => Effect.sync(() => call.observations.push(observation)))),
        }),
      ),
      Effect.tap((output) => {
        call.status = 'succeeded'
        call.output = output
        return saveEffect()
      }),
      Effect.catch((failure) => {
        call.status = 'failed'
        call.failure = failure.message
        return saveEffect().pipe(Effect.andThen(Effect.fail(failure)))
      }),
    )
  }

  const sourceHashes = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => {
        const body = await readFile(new URL(file, import.meta.url))
        return [file, `sha256:${createHash('sha256').update(body).digest('hex')}`]
      }),
    ),
  )
  const firstBatch = longBatches[0]
  const secondSourceBatch = longBatches[1]
  artifact.fixture = {
    meaningfulStressMessageCount,
    batches: [firstBatch, secondSourceBatch, ...stressBatches, heldOutBatch].map((item) => ({
      batchId: item.batchId,
      groupId: item.groupId,
      messageCount: item.messages.length,
      newMessageCount: item.newMessageIds.length,
      sha256: `sha256:${createHash('sha256').update(JSON.stringify(item)).digest('hex')}`,
    })),
  }
  await save()

  type TelegramResult = ReturnType<ReturnType<typeof telegramStore>['result']>
  const recordedCreate = artifact.stages.telegramCreate as
    | { receipt: { readonly completed: boolean }; after: TelegramResult }
    | undefined
  let firstReceipt: { readonly completed: boolean }
  let firstResult: TelegramResult
  if (recordedCreate) {
    firstReceipt = recordedCreate.receipt
    firstResult = recordedCreate.after
  } else {
    const first = telegramStore(firstBatch, [])
    const firstCallsStart = artifact.attempts.length
    const firstHost = telegramLayers({
      ...first.ports,
      model: capture('telegram') as TelegramPorts['model'],
    }).pipe(Layer.provideMerge(Action.layerImplementations), Layer.provideMerge(testEngine))
    firstReceipt = await Effect.runPromise(
      TelegramBatch.execute(firstBatch, { executionId: 'live-north-1' }).pipe(
        Effect.provide(firstHost),
        Effect.timeout('8 minutes'),
      ),
    )
    firstResult = first.result()
    artifact.stages.telegramCreate = {
      input: firstBatch,
      inputHash: `sha256:${createHash('sha256').update(JSON.stringify(firstBatch)).digest('hex')}`,
      sourceHashes: structuredClone(sourceHashes),
      calls: artifact.attempts.slice(firstCallsStart).map(({ id }) => id),
      receipt: firstReceipt,
      progress: first.progress,
      before: { posts: [] },
      after: firstResult,
    }
    await save()
  }
  expect(firstReceipt.completed).toBe(true)
  expect(firstResult.posts.some(({ authorId }) => authorId === 'maya')).toBe(true)
  expect(firstResult.questions.length).toBeGreaterThan(0)

  const mayaPost = firstResult.posts.find(({ authorId }) => authorId === 'maya')
  if (!mayaPost) throw new Error("Gemini did not create Maya's Orbit post.")
  const derivedAssociations = secondSourceBatch.messages.flatMap((message) =>
    (firstResult.associations[message.id] ?? []).flatMap((targetId) => {
      const post = firstResult.posts.find(({ id }) => id === targetId)
      return post
        ? [
            {
              messageId: message.id,
              targetId,
              targetKind: 'post' as const,
              ownerId: post.authorId,
            },
          ]
        : []
    }),
  )
  const secondBatch: typeof TS.BatchContext.Type = {
    ...secondSourceBatch,
    associations: derivedAssociations,
  }
  const carriedRequests = firstResult.questions.map((question, index) => ({
    id: question.id,
    ownerId: question.authorId,
    sequence: index + 1,
    text: question.text,
    intent: 'question' as const,
    linkedPostId: question.postId,
    pendingCandidateId: question.pendingCandidateId,
    addressed: false,
  }))
  const second = telegramStore(secondBatch, firstResult.posts, {
    sources: firstResult.sources,
    pendingRequests: carriedRequests,
    ownerNames: { maya: 'Maya Chen' },
  })
  const recordedEvidence = artifact.stages.telegramEvidence as
    | { receipt: { readonly completed: boolean }; after: TelegramResult }
    | undefined
  let secondReceipt: { readonly completed: boolean }
  let secondResult: TelegramResult
  if (recordedEvidence) {
    secondReceipt = recordedEvidence.receipt
    secondResult = recordedEvidence.after
  } else {
    const secondCallsStart = artifact.attempts.length
    const secondHost = telegramLayers({
      ...second.ports,
      model: capture('telegram') as TelegramPorts['model'],
    }).pipe(Layer.provideMerge(Action.layerImplementations), Layer.provideMerge(testEngine))
    secondReceipt = await Effect.runPromise(
      TelegramBatch.execute(secondBatch, { executionId: 'live-north-2' }).pipe(
        Effect.provide(secondHost),
        Effect.timeout('8 minutes'),
      ),
    )
    secondResult = second.result()
    artifact.stages.telegramEvidence = {
      input: secondBatch,
      inputHash: `sha256:${createHash('sha256').update(JSON.stringify(secondBatch)).digest('hex')}`,
      sourceHashes: structuredClone(sourceHashes),
      calls: artifact.attempts.slice(secondCallsStart).map(({ id }) => id),
      receipt: secondReceipt,
      progress: second.progress,
      before: firstResult,
      after: secondResult,
    }
    await save()
  }
  expect(secondReceipt.completed).toBe(true)
  expect(secondResult.posts.find(({ id }) => id === mayaPost.id)?.authorId).toBe('maya')
  expect(
    secondResult.notifications.every(
      ({ role, intent }) => role === 'assistant' && intent === 'informational',
    ),
  ).toBe(true)
  expect(secondResult.sources[mayaPost.id]?.length).toBeGreaterThanOrEqual(
    firstResult.sources[mayaPost.id]?.length ?? 0,
  )

  const history = Array.from({ length: 5 }, (_, index) => {
    const sequence = index * 2 + 1
    return [
      {
        id: `maya-history-${index + 1}:user`,
        userId: 'maya',
        conversationId: 'conversation:maya',
        role: 'user' as const,
        text: [
          'Orbit should remain invite-only.',
          'Use sentence case in titles.',
          'Keep release details factual.',
          'Prefer detailed explanations for now.',
          'Do not describe imports as automatic sync.',
        ][index],
        sequence,
        turnId: `maya-history-${index + 1}`,
        intent: 'informational' as const,
        linkedPostId: null,
        pendingCandidateId: null,
        addressed: true,
      },
      {
        id: `maya-history-${index + 1}:assistant`,
        userId: 'maya',
        conversationId: 'conversation:maya',
        role: 'assistant' as const,
        text: 'Recorded.',
        sequence: sequence + 1,
        turnId: `maya-history-${index + 1}`,
        intent: 'informational' as const,
        linkedPostId: null,
        pendingCandidateId: null,
        addressed: true,
      },
    ]
  }).flat()
  const privateStore = messagingStore(
    {
      posts: secondResult.posts.map((post) => ({ ...post, published: true })),
      memories: [
        { id: 'style', userId: 'maya', text: 'Prefer detailed explanations.', version: 1 },
        {
          id: 'scope',
          userId: 'maya',
          text: 'Never imply imports sync automatically.',
          version: 1,
        },
      ],
      messages: history,
      completedTurns: Array.from({ length: 5 }, (_, index) => ({
        turnId: `maya-history-${index + 1}`,
        userMessageId: `maya-history-${index + 1}:user`,
        assistantMessageId: `maya-history-${index + 1}:assistant`,
      })),
    },
    { addressingState: second.addressingState },
  )
  for (const question of firstResult.questions) {
    if (secondResult.resolutions[question.id]) continue
    privateStore.admitAgentMessage({
      id: question.id,
      userId: question.authorId,
      text: question.text,
      intent: 'question',
      ...(question.postId ? { linkedPostId: question.postId } : {}),
      ...(question.pendingCandidateId ? { pendingCandidateId: question.pendingCandidateId } : {}),
    })
  }
  for (const notification of secondResult.notifications) {
    if (notification.authorId !== 'maya') continue
    const notificationPost = secondResult.posts.find(
      ({ authorId }) => authorId === notification.authorId,
    )
    privateStore.admitAgentMessage({
      id: notification.id,
      userId: notification.authorId,
      text: `${notification.text}. Sources: ${notification.sourceIds.join(', ')}.`,
      intent: 'informational',
      ...(notificationPost ? { linkedPostId: notificationPost.id } : {}),
    })
  }
  const privateInput = {
    turnId: 'maya-private-final',
    userId: 'maya',
    text: 'For Orbit 0.4, patch export also records assignee changes. Attachments remain excluded and direct push is unavailable. Replace my detailed-writing preference: keep posts concise and factual.',
  }
  type PrivateSnapshot = ReturnType<typeof privateStore.snapshot>
  const recordedPrivate = artifact.stages.privateReply as
    | {
        receipt: typeof S.TurnReceipt.Type
        before: PrivateSnapshot
        after: PrivateSnapshot
      }
    | undefined
  let beforePrivate: PrivateSnapshot
  let privateReceipt: typeof S.TurnReceipt.Type
  let afterPrivate: PrivateSnapshot
  if (recordedPrivate) {
    beforePrivate = recordedPrivate.before
    privateReceipt = recordedPrivate.receipt
    afterPrivate = recordedPrivate.after
  } else {
    const privateCallsStart = artifact.attempts.length
    beforePrivate = privateStore.snapshot()
    const privateHost = messagingLayers({
      ...privateStore.ports,
      model: capture('private') as MessagingPorts['model'],
    }).pipe(Layer.provideMerge(Action.layerImplementations), Layer.provideMerge(testEngine))
    privateReceipt = await Effect.runPromise(
      MessagingTurn.execute(privateInput, { executionId: privateInput.turnId }).pipe(
        Effect.provide(privateHost),
        Effect.timeout('10 minutes'),
      ),
    )
    afterPrivate = privateStore.snapshot()
    artifact.stages.privateReply = {
      input: privateInput,
      inputHash: `sha256:${createHash('sha256').update(JSON.stringify(privateInput)).digest('hex')}`,
      sourceHashes: structuredClone(sourceHashes),
      receipt: privateReceipt,
      calls: artifact.attempts.slice(privateCallsStart).map(({ id }) => id),
      progress: privateStore.progress,
      observations: privateStore.observations,
      before: beforePrivate,
      after: afterPrivate,
    }
  }
  const stressStages: Record<string, unknown>[] = []
  for (const stressBatch of stressBatches) {
    const store = telegramStore(stressBatch, [])
    const callsStart = artifact.attempts.length
    const tasks = createModelTasks({
      ...store.ports,
      model: capture('telegram') as TelegramPorts['model'],
    })
    const generated = await Effect.runPromise(
      tasks
        .generate(
          TS.ModelSelection,
          'selection',
          selectionPrompt,
          stressBatch,
          { batchId: stressBatch.batchId, groupId: stressBatch.groupId },
          ['searchPosts'],
        )
        .pipe(Effect.retry({ times: 1 }), Effect.timeout('8 minutes')),
    )
    const selection: typeof TS.Selection.Type = {
      ...generated.value,
      lookedUpProjects: generated.evidence.projects,
    }
    validateSelection(stressBatch, selection)
    expect(selection.candidates.every(({ target }) => target.kind === 'new')).toBe(true)
    const stage = {
      batchId: stressBatch.batchId,
      input: stressBatch,
      inputHash: `sha256:${createHash('sha256').update(JSON.stringify(stressBatch)).digest('hex')}`,
      sourceHashes: structuredClone(sourceHashes),
      calls: artifact.attempts.slice(callsStart).map(({ id }) => id),
      output: selection,
      freshMessageCount: stressBatch.newMessageIds.length,
    }
    stressStages.push(stage)
    artifact.stages.telegramStress = stressStages
    await save()
  }

  const heldOutStore = telegramStore(heldOutBatch, firstResult.posts, {
    sources: firstResult.sources,
    ownerNames: { maya: 'Maya Chen', iris: 'Iris Park', zoe: 'Zoe Bell' },
  })
  const heldOutCallsStart = artifact.attempts.length
  const heldOutTasks = createModelTasks({
    ...heldOutStore.ports,
    model: capture('telegram') as TelegramPorts['model'],
  })
  const heldOutGenerated = await Effect.runPromise(
    heldOutTasks
      .generate(
        TS.ModelSelection,
        'selection',
        selectionPrompt,
        heldOutBatch,
        { batchId: heldOutBatch.batchId, groupId: heldOutBatch.groupId },
        ['searchPosts'],
      )
      .pipe(Effect.retry({ times: 1 }), Effect.timeout('8 minutes')),
  )
  const heldOutSelection: typeof TS.Selection.Type = {
    ...heldOutGenerated.value,
    lookedUpProjects: heldOutGenerated.evidence.projects,
  }
  validateSelection(heldOutBatch, heldOutSelection)
  expect(heldOutSelection.candidates.every(({ target }) => target.kind === 'existing')).toBe(true)
  const publicSearchObservations = artifact.attempts
    .slice(heldOutCallsStart)
    .flatMap(({ observations }) => observations)
    .filter(
      (item): item is { kind: string; name: string; output: unknown } =>
        typeof item === 'object' && item !== null && 'name' in item && item.name === 'searchPosts',
    )
  expect(JSON.stringify(publicSearchObservations)).not.toContain('"detail"')
  artifact.stages.heldOutSelection = {
    input: heldOutBatch,
    inputHash: `sha256:${createHash('sha256').update(JSON.stringify(heldOutBatch)).digest('hex')}`,
    sourceHashes: structuredClone(sourceHashes),
    calls: artifact.attempts.slice(heldOutCallsStart).map(({ id }) => id),
    output: heldOutSelection,
  }
  const published = afterPrivate.turns[privateInput.turnId]?.published
  const privatePlannerInput = artifact.attempts.find(
    ({ task, workflow }) => task === 'query-planner' && workflow === 'private',
  )?.input as typeof S.PlannerContext.Type | undefined
  artifact.inspection = {
    modelCalls: artifact.attempts.length,
    failedAttempts: artifact.attempts
      .filter(({ status }) => status === 'failed')
      .map(({ id, failure }) => ({ id, failure })),
    firstCreatedOrbit: Boolean(mayaPost),
    firstQuestionCount: firstResult.questions.length,
    telegramUpdateCount: secondResult.diffs.length,
    telegramResolutionCount: Object.keys(secondResult.resolutions).length,
    telegramNotificationCount: secondResult.notifications.length,
    retainedSourceCount: secondResult.sources[mayaPost.id]?.length ?? 0,
    meaningfulStressMessagesExecuted: meaningfulStressMessageCount,
    stressSelectionCalls: stressStages.length,
    heldOutCandidateCount: heldOutSelection.candidates.length,
    privateRecentExchangeIds: published?.turn
      ? (privatePlannerInput?.recentExchanges.map(({ turnId }) => turnId) ?? [])
      : [],
    privatePostDiffCount: privateReceipt.diffs.length,
    privateMemoryTexts: afterPrivate.memories
      .filter(({ userId }) => userId === 'maya')
      .map(({ text }) => text),
    stillUnanswered: afterPrivate.messages
      .filter(({ role, addressed }) => role === 'assistant' && !addressed)
      .map(({ id, text }) => ({ id, text })),
    judgement:
      'Assertions check identity, source retention, real informational messages, bounded retrieval, semantic post changes and preference replacement. Generated prose is not matched exactly.',
  }
  await save()

  expect(privateReceipt.status).toBe('completed')
  expect(artifact.attempts.some(({ status }) => status === 'running')).toBe(false)
  expect(published?.turn.userId).toBe('maya')
  expect(
    artifact.attempts.find(
      ({ task, workflow }) => task === 'query-planner' && workflow === 'private',
    )?.input,
  ).toMatchObject({
    recentExchanges: [
      { turnId: 'maya-history-3' },
      { turnId: 'maya-history-4' },
      { turnId: 'maya-history-5' },
    ],
  })
  expect(afterPrivate.posts.every(({ authorId }) => authorId === 'maya')).toBe(true)
  expect(afterPrivate.memories.some(({ text }) => /concise/i.test(text))).toBe(true)
  expect(afterPrivate.memories.some(({ text }) => /detailed explanations/i.test(text))).toBe(false)
  expect(privateReceipt.diffs.length).toBeGreaterThan(0)
  expect(meaningfulStressMessageCount).toBeGreaterThanOrEqual(200)
  expect(stressStages).toHaveLength(stressBatches.length)
  const finalBody = `${JSON.stringify(artifact, null, 2)}\n`
  await enqueueAtomicWrite(latestArtifactUrl, finalBody)
  await enqueueAtomicWrite(
    coverageUrl,
    `${JSON.stringify(
      {
        runId,
        runFile: artifact.provenance.runFile,
        model: modelId,
        meaningfulTelegramMessages: meaningfulStressMessageCount,
        stressBatches: stressBatches.length,
        modelCalls: artifact.attempts.length,
        failedModelCalls: artifact.attempts.filter(({ status }) => status === 'failed').length,
        workflowFailures: artifact.workflowFailures.length,
        limitations: [
          'Shared synchronized in-memory PoC only; production database and queue durability are not implemented.',
          'Synthetic Telegram and private messages; native web evidence is accepted only from actual tool observations.',
        ],
      },
      null,
      2,
    )}\n`,
  )
}, 1_800_000)
