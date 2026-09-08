import * as Action from '@smthrs/flow/Action'
import * as Graph from '@smthrs/flow/Graph'
import { Deferred, Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { testEngine } from '../../shared/test-engine'
import { messagingLayers } from '../agents'
import * as S from '../schemas'
import type { Ports } from '../tools'
import { MessagingTurn, RetryBackground } from '../workflow'
import { candidates, fixture, otherUserId, userId } from './fixtures'
import { messagingStore } from './store'

const planner = {
  queries: [{ resource: 'user_messages' as const, terms: ['Aurora'], limit: 5 }],
}
const response = (turnId: string): typeof S.Response.Type => ({
  text: 'Updated Noted and Atlas, and published Clipwise. Does Clipwise have a public URL?',
  intent: 'question',
  classification: 'partial',
  postChanges: [
    {
      postId: 'noted',
      expectedVersion: 2,
      title: 'Noted',
      summary: 'Offline multilingual voice transcription for macOS.',
      detail: 'Noted transcribes English and Mandarin voice notes on device.',
      published: true,
      evidence: [
        { kind: 'post', id: 'noted', version: 2 },
        { kind: 'user_message', id: `${turnId}:user` },
      ],
    },
    {
      postId: 'atlas',
      expectedVersion: 4,
      title: 'Atlas',
      summary: 'An offline visual workspace for research.',
      detail: 'Atlas connects notes and sources without a network connection.',
      published: true,
      evidence: [
        { kind: 'post', id: 'atlas', version: 4 },
        { kind: 'user_message', id: `${turnId}:user` },
      ],
    },
  ],
  pendingOutcome: {
    kind: 'publish',
    candidateId: 'candidate-clipwise',
    expectedVersion: 1,
    title: 'Clipwise',
    summary: 'A free clipboard organizer.',
    detail: 'Clipwise groups clipboard history by project.',
    evidence: [
      { kind: 'candidate', id: 'candidate-clipwise', version: 1 },
      { kind: 'user_message', id: `${turnId}:user` },
    ],
  },
})

function host(store: ReturnType<typeof messagingStore>, model: Ports['model']) {
  return messagingLayers({ ...store.ports, model }).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(testEngine),
  )
}

function addRequests(store: ReturnType<typeof messagingStore>) {
  store.admitAgentMessage({
    id: 'request-language',
    userId,
    text: 'Does Noted support Mandarin?',
    intent: 'question',
    linkedPostId: 'noted',
  })
  store.admitAgentMessage({
    id: 'request-price',
    userId,
    text: 'What does Clipwise cost?',
    intent: 'question',
    pendingCandidateId: 'candidate-clipwise',
  })
  store.admitAgentMessage({
    id: 'request-unrelated',
    userId,
    text: 'Should Atlas support team workspaces?',
    intent: 'suggestion',
    linkedPostId: 'atlas',
  })
  store.admitAgentMessage({
    id: 'request-partial',
    userId,
    text: 'Which three export formats will Noted support?',
    intent: 'question',
    linkedPostId: 'noted',
  })
  store.admitAgentMessage({
    id: 'information-only',
    userId,
    text: 'I indexed the latest project messages.',
    intent: 'informational',
  })
}

it('plans the actual Smithers workflows', () => {
  expect(
    Graph.build(MessagingTurn, { turnId: 'turn-graph', userId, text: 'Update Noted.' }).diagnostics,
  ).toEqual([])
  expect(Graph.build(RetryBackground, { turnId: 'turn-graph', userId }).diagnostics).toEqual([])
})

it('publishes atomically before concurrent background work and holds per-user admission', async () => {
  const store = messagingStore(fixture)
  addRequests(store)
  const backgroundStarted = await Effect.runPromise(Deferred.make<void>())
  const release = await Effect.runPromise(Deferred.make<void>())
  const started = new Set<string>()
  const seen: { task: string; input: unknown }[] = []
  const model: Ports['model'] = (request) =>
    Effect.gen(function* () {
      seen.push({ task: request.task, input: request.input })
      if (request.task === 'query-planner') return planner
      if (request.task === 'responder') {
        const input = request.input as typeof S.ResponderContext.Type
        expect(input.recentExchanges.map(({ turnId }) => turnId)).toEqual([
          'history-3',
          'history-4',
          'history-5',
        ])
        expect(input.queryResults.userMessages.map(({ id }) => id)).toContain('history-1:user')
        expect(input.queryResults.posts.map(({ id }) => id).sort()).toEqual(['atlas', 'noted'])
        expect([...input.queryResults.linkedRequestPostIds].sort()).toEqual(['atlas', 'noted'])
        expect(input.queryResults.posts.some(({ authorId }) => authorId === otherUserId)).toBe(
          false,
        )
        expect(input.memories.map(({ id }) => id).sort()).toEqual(['platform', 'style'])
        return response(input.turn.turnId)
      }
      started.add(request.task)
      if (started.size === 2) yield* Deferred.succeed(backgroundStarted, undefined)
      yield* Deferred.await(release)
      if (request.task === 'memory')
        return {
          operations: [
            {
              kind: 'update',
              id: 'style',
              expectedVersion: 1,
              text: 'Use detailed factual posts.',
            },
            { kind: 'delete', id: 'platform', expectedVersion: 3 },
          ],
        }
      return {
        resolutions: [
          {
            requestMessageId: 'request-language',
            outcome: 'answered',
            reason: 'User confirmed Mandarin support.',
          },
          {
            requestMessageId: 'request-price',
            outcome: 'ignored',
            reason: 'User explicitly said to skip pricing.',
          },
        ],
      }
    })
  const running = Effect.runPromise(
    MessagingTurn.execute(
      {
        turnId: 'turn-main',
        userId,
        text: 'Noted supports Mandarin. Clipwise is free, publish it. Skip pricing. Update Atlas to say it works offline. Prefer detailed factual posts and forget my macOS-only preference.',
      },
      { executionId: 'turn-main' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('5 seconds')),
  )
  await Effect.runPromise(Deferred.await(backgroundStarted))
  const during = store.snapshot()
  expect(during.turns['turn-main'].status).toBe('published')
  expect(during.posts.find(({ id }) => id === 'noted')?.version).toBe(3)
  expect(during.posts.find(({ id }) => id === 'atlas')?.version).toBe(5)
  const candidatePublication = during.turns['turn-main'].published?.candidatePublications[0]
  expect(candidatePublication?.candidateId).toBe('candidate-clipwise')
  expect(during.posts.find(({ id }) => id === candidatePublication?.postId)).toBeDefined()
  expect(during.memories.find(({ id }) => id === 'style')?.version).toBe(1)

  const callsBeforeRejections = seen.length
  const rejectedInputs = [
    {
      turnId: 'turn-main',
      userId,
      text: 'Noted supports Mandarin. Clipwise is free, publish it. Skip pricing. Update Atlas to say it works offline. Prefer detailed factual posts and forget my macOS-only preference.',
    },
    { turnId: 'turn-main', userId, text: 'Different text.' },
    { turnId: 'turn-main', userId: otherUserId, text: 'Cross-user collision.' },
  ] as const
  for (const [index, rejectedInput] of rejectedInputs.entries()) {
    const rejected = await Effect.runPromise(
      MessagingTurn.execute(rejectedInput, { executionId: `turn-rejected-${index}` }).pipe(
        Effect.provide(host(store, model)),
        Effect.timeout('2 seconds'),
      ),
    )
    expect(rejected.status).toBe('failed')
    expect(store.active.get(userId)).toBe('turn-main')
  }
  const overlap = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'turn-overlap', userId, text: 'This must not overlap.' },
      { executionId: 'turn-overlap' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('2 seconds')),
  )
  expect(overlap.status).toBe('failed')
  expect(store.active.get(userId)).toBe('turn-main')
  const completedReplayDuringActive = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'history-5', userId, text: 'Keep release details factual.' },
      { executionId: 'history-5:replay' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('2 seconds')),
  )
  expect(completedReplayDuringActive.status).toBe('completed')
  expect(store.active.get(userId)).toBe('turn-main')
  expect(seen).toHaveLength(callsBeforeRejections)
  const other = await Effect.runPromise(
    store.ports.admitTurn({ turnId: 'turn-other', userId: otherUserId, text: 'Independent.' }),
  )
  expect(other.result.kind).toBe('admitted')
  if (other.result.kind !== 'admitted') throw new Error('Expected an admitted independent turn.')
  expect(other.result.context.turn.userId).toBe(otherUserId)
  await Effect.runPromise(
    store.ports.abortTurn({
      turn: other.result.context.turn,
      failure: new S.Failure({ operation: 'test', message: 'cleanup' }),
    }),
  )

  await Effect.runPromise(Deferred.succeed(release, undefined))
  const receipt = await running
  expect(receipt.status).toBe('completed')
  expect(receipt.diffs).toHaveLength(2)
  const final = store.snapshot()
  expect(final.memories).toEqual([
    { id: 'foreign-memory', userId: otherUserId, text: 'Private preference.', version: 1 },
    { id: 'style', userId, text: 'Use detailed factual posts.', version: 2 },
  ])
  expect(final.addressing).toMatchObject({
    'request-language': { outcome: 'answered' },
    'request-price': { outcome: 'ignored' },
  })
  expect(final.messages.find(({ id }) => id === 'request-unrelated')?.addressed).toBe(false)
  expect(final.messages.find(({ id }) => id === 'request-partial')?.addressed).toBe(false)
  expect(final.messages.find(({ id }) => id === 'turn-main:assistant')?.addressed).toBe(false)
  expect(final.messages.find(({ id }) => id === 'information-only')?.addressed).toBe(true)
  expect(
    new Set(
      final.messages
        .filter(({ userId: owner }) => owner === userId)
        .map(({ conversationId }) => conversationId),
    ),
  ).toEqual(new Set([`conversation:${userId}`]))
  expect(seen.filter(({ task }) => ['memory', 'addressing'].includes(task))).toHaveLength(2)
  const beforeReplay = store.snapshot()
  const replayed = await Effect.runPromise(
    MessagingTurn.execute(
      {
        turnId: 'turn-main',
        userId,
        text: 'Noted supports Mandarin. Clipwise is free, publish it. Skip pricing. Update Atlas to say it works offline. Prefer detailed factual posts and forget my macOS-only preference.',
      },
      { executionId: 'turn-main:completed-replay' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('2 seconds')),
  )
  expect(replayed).toEqual(receipt)
  expect(store.snapshot()).toEqual(beforeReplay)
  expect(seen).toHaveLength(callsBeforeRejections)
  await expect(
    `${JSON.stringify(
      {
        mode: 'scripted-model',
        receipt,
        diffs: final.turns['turn-main'].published?.diffs,
        memories: final.memories,
        addressing: final.addressing,
      },
      null,
      2,
    )}\n`,
  ).toMatchFileSnapshot('./scripted.result.json')
})

it('keeps outbound admission idempotent and distinguishes actionable messages', () => {
  const store = messagingStore(fixture)
  const question = store.admitAgentMessage({
    id: 'outbound-1',
    userId,
    text: 'Does Noted support Mandarin?',
    intent: 'question',
    linkedPostId: 'noted',
  })
  expect(
    store.admitAgentMessage({
      id: 'outbound-1',
      userId,
      text: 'Does Noted support Mandarin?',
      intent: 'question',
      linkedPostId: 'noted',
    }),
  ).toEqual(question)
  store.admitAgentMessage({
    id: 'outbound-2',
    userId,
    text: 'Indexing finished.',
    intent: 'informational',
  })
  expect(store.snapshot().messages.find(({ id }) => id === 'outbound-1')?.addressed).toBe(false)
  expect(store.snapshot().messages.find(({ id }) => id === 'outbound-2')?.addressed).toBe(true)
  expect(() =>
    store.admitAgentMessage({
      id: 'outbound-1',
      userId,
      text: 'Different text.',
      intent: 'question',
      linkedPostId: 'noted',
    }),
  ).toThrow('reused')
  expect(() =>
    store.admitAgentMessage({
      id: 'foreign-link',
      userId,
      text: 'Wrong owner.',
      intent: 'request',
      linkedPostId: 'foreign-post',
    }),
  ).toThrow('another user')
})

it('rolls back every post change on a version conflict and rejects foreign ownership', async () => {
  const store = messagingStore(fixture)
  const before = store.snapshot().posts
  const baseStale = response('turn-stale')
  const stale: typeof S.Response.Type = {
    ...baseStale,
    pendingOutcome: { kind: 'none' },
    postChanges: [baseStale.postChanges[0], { ...baseStale.postChanges[1], expectedVersion: 3 }],
  }
  const model: Ports['model'] = (request) =>
    Effect.succeed(
      request.task === 'query-planner'
        ? planner
        : request.task === 'responder'
          ? stale
          : request.task === 'memory'
            ? { operations: [] }
            : { resolutions: [] },
    )
  const receipt = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'turn-stale', userId, text: 'Update Noted and Atlas.' },
      { executionId: 'turn-stale' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(receipt.status).toBe('failed')
  expect(store.snapshot().posts).toEqual(before)

  const foreignStore = messagingStore(fixture)
  const foreign: typeof S.Response.Type = {
    text: 'Changed it.',
    intent: 'informational',
    classification: 'instruction',
    pendingOutcome: { kind: 'none' },
    postChanges: [
      {
        postId: 'foreign-post',
        expectedVersion: 7,
        title: 'Foreign',
        summary: 'Changed.',
        detail: 'Changed.',
        published: true,
        evidence: [{ kind: 'user_message', id: 'turn-foreign:user' }],
      },
    ],
  }
  const foreignModel: Ports['model'] = (request) =>
    Effect.succeed(
      request.task === 'query-planner'
        ? { queries: [{ resource: 'posts', terms: ['Foreign'], limit: 10 }] }
        : foreign,
    )
  const foreignReceipt = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'turn-foreign', userId, text: 'Change Foreign.' },
      { executionId: 'turn-foreign' },
    ).pipe(Effect.provide(host(foreignStore, foreignModel)), Effect.timeout('3 seconds')),
  )
  expect(foreignReceipt.status).toBe('failed')
  expect(foreignStore.snapshot().posts).toEqual(before)
})

it('records a targeted pending-candidate clarification without inventing a post', async () => {
  const store = messagingStore(fixture)
  const model: Ports['model'] = (request) => {
    if (request.task === 'query-planner') return Effect.succeed({ queries: [] })
    if (request.task === 'responder')
      return Effect.succeed({
        text: 'What license does Clipwise use?',
        intent: 'question',
        classification: 'clarification',
        postChanges: [],
        pendingOutcome: {
          kind: 'clarify',
          candidateId: 'candidate-clipwise',
          question: 'What license does Clipwise use?',
        },
      })
    if (request.task === 'memory') return Effect.succeed({ operations: [] })
    return Effect.succeed({ resolutions: [] })
  }
  const receipt = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'turn-clarify', userId, text: 'Publish Clipwise.' },
      { executionId: 'turn-clarify' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(receipt.status).toBe('completed')
  expect(store.snapshot().posts.map(({ id }) => id)).not.toContain('clipwise')
  expect(store.snapshot().candidates).toEqual(candidates)
  expect(store.snapshot().messages.find(({ id }) => id === 'turn-clarify:assistant')).toMatchObject(
    {
      addressed: false,
      pendingCandidateId: 'candidate-clipwise',
    },
  )
})

it('retries only terminal background work without duplicating the published answer or diffs', async () => {
  const store = messagingStore(fixture)
  let failMemory = true
  const modelCalls = { planner: 0, responder: 0, memory: 0, addressing: 0 }
  const model: Ports['model'] = (request) => {
    if (request.task === 'query-planner') modelCalls.planner++
    if (request.task === 'responder') modelCalls.responder++
    if (request.task === 'memory') modelCalls.memory++
    if (request.task === 'addressing') modelCalls.addressing++
    if (request.task === 'query-planner')
      return Effect.succeed({ queries: [{ resource: 'posts', terms: ['Noted'], limit: 2 }] })
    if (request.task === 'responder') {
      const value = response('turn-retry')
      return Effect.succeed({
        ...value,
        postChanges: [value.postChanges[0]],
        pendingOutcome: { kind: 'none' as const },
        text: 'Updated Noted.',
        intent: 'informational' as const,
      })
    }
    if (request.task === 'memory') {
      if (failMemory)
        return Effect.fail(new S.Failure({ operation: 'memory', message: 'provider unavailable' }))
      return Effect.succeed({
        operations: [
          { kind: 'update', id: 'style', expectedVersion: 1, text: 'Use detailed factual posts.' },
        ],
      })
    }
    return Effect.succeed({ resolutions: [] })
  }
  const first = await Effect.runPromise(
    MessagingTurn.execute(
      {
        turnId: 'turn-retry',
        userId,
        text: 'Noted supports Mandarin. Prefer detailed factual posts.',
      },
      { executionId: 'turn-retry' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(first.status).toBe('background_failed')
  const published = store.snapshot()
  expect(published.posts.find(({ id }) => id === 'noted')?.version).toBe(3)
  expect(published.messages.filter(({ id }) => id === 'turn-retry:assistant')).toHaveLength(1)
  failMemory = false
  const retried = await Effect.runPromise(
    RetryBackground.execute(
      { turnId: 'turn-retry', userId },
      { executionId: 'turn-retry:background-retry' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(retried.status).toBe('completed')
  const final = store.snapshot()
  expect(final.posts).toEqual(published.posts)
  expect(final.messages).toEqual(published.messages)
  expect(final.memories.find(({ id }) => id === 'style')).toMatchObject({ version: 2 })
  expect(final.turns['turn-retry'].attempts).toEqual({ memory: 2, addressing: 1 })
  expect(modelCalls).toEqual({ planner: 1, responder: 1, memory: 2, addressing: 1 })
})

it('rejects a stale background retry after a newer user turn is admitted', async () => {
  const store = messagingStore(fixture)
  let oldMemoryCalls = 0
  const model: Ports['model'] = (request) => {
    if (request.task === 'query-planner') return Effect.succeed({ queries: [] })
    if (request.task === 'responder')
      return Effect.succeed({
        text: 'Acknowledged the preference change; background processing is still pending.',
        intent: 'informational',
        classification: 'instruction',
        postChanges: [],
        pendingOutcome: { kind: 'none' },
      })
    if (request.task === 'addressing') return Effect.succeed({ resolutions: [] })
    const input = request.input as { userMessage: typeof S.Message.Type }
    if (input.userMessage.turnId === 'turn-old') {
      oldMemoryCalls++
      return Effect.fail(new S.Failure({ operation: 'memory', message: 'provider unavailable' }))
    }
    return Effect.succeed({
      operations: [
        { kind: 'update', id: 'style', expectedVersion: 1, text: 'Keep posts concise.' },
      ],
    })
  }
  const old = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'turn-old', userId, text: 'Prefer detailed posts.' },
      { executionId: 'turn-old' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(old.status).toBe('background_failed')
  expect(store.active.has(userId)).toBe(false)
  const newer = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'turn-new', userId, text: 'I retract that. Keep posts concise.' },
      { executionId: 'turn-new' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(newer.status).toBe('completed')
  await expect(
    Effect.runPromise(
      RetryBackground.execute(
        { turnId: 'turn-old', userId },
        { executionId: 'turn-old:stale-retry' },
      ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
    ),
  ).rejects.toThrow('stale')
  expect(oldMemoryCalls).toBe(1)
  expect(store.snapshot().memories.find(({ id }) => id === 'style')).toMatchObject({
    text: 'Keep posts concise.',
    version: 2,
  })
  expect(store.active.has(userId)).toBe(false)
})

it('stops background retries after the explicit two-attempt budget', async () => {
  const store = messagingStore(fixture)
  const model: Ports['model'] = (request) => {
    if (request.task === 'query-planner') return Effect.succeed({ queries: [] })
    if (request.task === 'responder')
      return Effect.succeed({
        text: 'No post change.',
        intent: 'informational',
        classification: 'answer',
        postChanges: [],
        pendingOutcome: { kind: 'none' },
      })
    if (request.task === 'memory')
      return Effect.fail(new S.Failure({ operation: 'memory', message: 'provider unavailable' }))
    return Effect.succeed({ resolutions: [] })
  }
  const first = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'turn-budget', userId, text: 'Remember a durable preference.' },
      { executionId: 'turn-budget' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(first.status).toBe('background_failed')
  const second = await Effect.runPromise(
    RetryBackground.execute(
      { turnId: 'turn-budget', userId },
      { executionId: 'turn-budget:retry-1' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(second.status).toBe('background_failed')
  await expect(
    Effect.runPromise(
      RetryBackground.execute(
        { turnId: 'turn-budget', userId },
        { executionId: 'turn-budget:retry-2' },
      ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
    ),
  ).rejects.toThrow('retry budget exhausted')
  expect(store.active.has(userId)).toBe(false)
  expect(store.snapshot().messages.filter(({ id }) => id === 'turn-budget:assistant')).toHaveLength(
    1,
  )
})

it('fails closed after the responder exceeds its eight-call research budget', async () => {
  const store = messagingStore(fixture)
  const model: Ports['model'] = (request) => {
    if (request.task === 'query-planner') return Effect.succeed({ queries: [] })
    return Effect.gen(function* () {
      for (let index = 0; index < 9; index++)
        yield* request.observe({
          kind: 'native-tool',
          name: 'search_web',
          input: { Query: `bounded probe ${index}` },
          output: {
            provenance: 'antigravity-cli-step-artifact-v1',
            status: 'success',
            toolOutput: 'No sources.',
          },
        })
      return {
        text: 'This result must not publish.',
        intent: 'informational',
        classification: 'answer',
        postChanges: [],
        pendingOutcome: { kind: 'none' },
      }
    })
  }
  const receipt = await Effect.runPromise(
    MessagingTurn.execute(
      { turnId: 'turn-tool-budget', userId, text: 'Research this.' },
      { executionId: 'turn-tool-budget' },
    ).pipe(Effect.provide(host(store, model)), Effect.timeout('3 seconds')),
  )
  expect(receipt.status).toBe('failed')
  expect(store.snapshot().messages.some(({ id }) => id === 'turn-tool-budget:assistant')).toBe(
    false,
  )
  expect(store.active.has(userId)).toBe(false)
})
