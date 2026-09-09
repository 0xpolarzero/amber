import * as Action from '@smthrs/flow/Action'
import { Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { messagingStore } from '../../messaging/testing/store'
import { OwnerCoordinator } from '../../shared/owner-coordinator'
import { testEngine } from '../../shared/test-engine'
import { telegramLayers } from '../agents'
import * as S from '../schemas'
import type { Ports } from '../tools'
import { TelegramBatch } from '../workflow'
import { heldOutBatch, longBatches, syntheticMessageCount } from './long-conversations'
import { telegramStore } from './store'

const message = (id: string, authorId: string, text: string) => ({
  id,
  authorId,
  text,
  replyToId: null,
  albumId: null,
})

const existingPost: typeof S.Post.Type = {
  id: 'north-orbit',
  authorId: 'maya',
  version: 4,
  title: 'Orbit',
  summary: 'A local-first issue tracker.',
  detail: 'Orbit imports GitHub issues for offline editing.',
}

const existingBatch: typeof S.BatchContext.Type = {
  batchId: 'existing-update',
  groupId: 'makers-north',
  messages: [
    message('e-1', 'liam', 'Orbit exported my issue edits as a patch file.'),
    message('e-2', 'maya', 'Patch export is in 0.4; direct push is not.'),
  ],
  newMessageIds: ['e-1', 'e-2'],
  associations: [
    { messageId: 'e-1', targetId: 'north-orbit', targetKind: 'post', ownerId: 'maya' },
  ],
}

const modelSelection: typeof S.ModelSelection.Type = {
  candidates: [
    {
      authorId: 'liam',
      project: 'Orbit',
      messageIds: ['e-1', 'e-2'],
      target: { kind: 'existing', targetId: 'north-orbit' },
    },
  ],
  ignored: [],
  unresolved: [],
}

function host(store: ReturnType<typeof telegramStore>, proposal: typeof S.Proposal.Type) {
  const model: Ports['model'] = (request) =>
    Effect.gen(function* () {
      if (request.task === 'selection') {
        yield* request.callTool('searchPosts', { queries: ['Orbit', 'liam'] })
        return modelSelection
      }
      return proposal
    })
  return telegramLayers({ ...store.ports, model }).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(testEngine),
  )
}

it('keeps a reviewable 300+ message corpus with collisions and held-out edge cases', () => {
  expect(syntheticMessageCount).toBeGreaterThanOrEqual(300)
  expect(new Set(longBatches.map(({ groupId }) => groupId)).size).toBe(2)
  expect(
    longBatches.filter(({ messages }) => messages.some(({ text }) => /\bOrbit\b/.test(text))),
  ).toHaveLength(4)
  expect(heldOutBatch.messages.some(({ text }) => /attachments/i.test(text))).toBe(true)
  expect(
    longBatches
      .flatMap(({ messages }) => messages)
      .some(({ text }) => /SYSTEM:|malicious/i.test(text)),
  ).toBe(true)
})

it('routes nonowner evidence to the saved owner and commits edit, resolution, sources and one informational receipt', async () => {
  const store = telegramStore(existingBatch, [existingPost], {
    sources: { 'north-orbit': [{ kind: 'web', url: 'https://example.com/orbit-v03' }] },
    pendingRequests: [
      {
        id: 'request-export',
        ownerId: 'maya',
        sequence: 1,
        text: 'Does Orbit export edits as a patch file?',
        intent: 'question',
        linkedPostId: 'north-orbit',
        pendingCandidateId: null,
        addressed: false,
      },
      {
        id: 'request-compound',
        ownerId: 'maya',
        sequence: 2,
        text: 'Does direct push work and are attachments included?',
        intent: 'question',
        linkedPostId: 'north-orbit',
        pendingCandidateId: null,
        addressed: false,
      },
    ],
  })
  const proposal: typeof S.Proposal.Type = {
    postEdit: {
      existingPostId: 'north-orbit',
      expectedVersion: 4,
      title: 'Orbit',
      summary: 'A local-first issue tracker with patch export.',
      detail: 'Orbit imports GitHub issues for offline editing and exports edits as a patch file.',
      sources: [
        { kind: 'telegram', messageId: 'e-1' },
        { kind: 'telegram', messageId: 'e-2' },
      ],
    },
    resolutions: [
      {
        requestMessageId: 'request-export',
        outcome: 'answered',
        reason: 'Liam observed patch export and Maya confirmed version 0.4.',
        sources: [
          { kind: 'telegram', messageId: 'e-1' },
          { kind: 'telegram', messageId: 'e-2' },
        ],
      },
    ],
    question: null,
    reason: 'Patch export is a supported material update; the compound request remains partial.',
  }
  const receipt = await Effect.runPromise(
    TelegramBatch.execute(
      { batchId: existingBatch.batchId, groupId: existingBatch.groupId },
      { executionId: existingBatch.batchId },
    ).pipe(Effect.provide(host(store, proposal)), Effect.timeout('3 seconds')),
  )
  expect(receipt.completed).toBe(true)
  expect(store.work?.[0]).toMatchObject({ ownerId: 'maya', candidate: { authorId: 'liam' } })
  expect(store.posts[0]).toMatchObject({ authorId: 'maya', version: 5 })
  expect(store.result().sources['north-orbit']).toEqual([
    { kind: 'web', url: 'https://example.com/orbit-v03' },
    { kind: 'telegram', messageId: 'e-1' },
    { kind: 'telegram', messageId: 'e-2' },
  ])
  expect(store.result().resolutions).toMatchObject({
    'request-export': { sourceId: 'existing-update:0@0' },
  })
  expect(store.result().resolutions).not.toHaveProperty('request-compound')
  expect(store.notifications).toHaveLength(1)
  expect(store.notifications[0]).toMatchObject({ role: 'assistant', intent: 'informational' })

  const beforeReplay = store.result()
  await Effect.runPromise(
    TelegramBatch.execute(
      { batchId: existingBatch.batchId, groupId: existingBatch.groupId },
      { executionId: existingBatch.batchId },
    ).pipe(Effect.provide(host(store, proposal)), Effect.timeout('3 seconds')),
  )
  expect(store.result()).toEqual(beforeReplay)
})

it('supports resolution without an edit and preserves the first winning reason on overlap', async () => {
  const store = telegramStore(existingBatch, [existingPost], {
    pendingRequests: [
      {
        id: 'request-export',
        ownerId: 'maya',
        sequence: 1,
        text: 'Does Orbit export patches?',
        intent: 'question',
        linkedPostId: 'north-orbit',
        pendingCandidateId: null,
        addressed: false,
      },
    ],
  })
  const proposal: typeof S.Proposal.Type = {
    postEdit: null,
    resolutions: [
      {
        requestMessageId: 'request-export',
        outcome: 'answered',
        reason: 'First supported answer.',
        sources: [{ kind: 'telegram', messageId: 'e-1' }],
      },
    ],
    question: null,
    reason: 'The current post already contains the fact.',
  }
  await Effect.runPromise(
    TelegramBatch.execute(existingBatch, { executionId: 'resolution-only' }).pipe(
      Effect.provide(host(store, proposal)),
      Effect.timeout('3 seconds'),
    ),
  )
  expect(store.posts[0]).toEqual(existingPost)
  expect(store.resolutions.get('request-export')).toMatchObject({
    reason: 'First supported answer.',
  })
  expect(store.notifications[0].text).toBe('1 question answered')
})

it('paginates public group search without leaking same-name projects from another group', async () => {
  const posts = Array.from({ length: 26 }, (_, index): typeof S.Post.Type => ({
    id: `north-${String(index).padStart(2, '0')}`,
    authorId: `owner-${index}`,
    version: 1,
    title: `Orbit ${index}`,
    summary: 'North group project.',
    detail: 'Bounded public summary.',
  })).concat({ ...existingPost, id: 'south-collision', authorId: 'theo' })
  const store = telegramStore(existingBatch, posts, {
    projectGroups: { 'south-collision': 'makers-south' },
  })
  const first = (await Effect.runPromise(
    store.ports.readTool({ groupId: 'makers-north', batchId: 'existing-update' }, 'searchPosts', {
      queries: ['Orbit'],
    }),
  )) as typeof S.ProjectSearchPage.Type
  const second = (await Effect.runPromise(
    store.ports.readTool({ groupId: 'makers-north', batchId: 'existing-update' }, 'searchPosts', {
      queries: ['Orbit'],
      cursor: first.nextCursor ?? 0,
    }),
  )) as typeof S.ProjectSearchPage.Type
  expect(first.items).toHaveLength(20)
  expect(second.items).toHaveLength(6)
  expect(second.nextCursor).toBeNull()
  expect(
    [...first.items, ...second.items].some(({ targetId }) => targetId === 'south-collision'),
  ).toBe(false)
})

it('waits for an active owner private turn before committing a Telegram write', async () => {
  const coordinator = new OwnerCoordinator()
  const privateStore = messagingStore({}, { coordinator })
  const admission = await Effect.runPromise(
    privateStore.ports.admitTurn({
      turnId: 'private-active',
      userId: 'maya',
      text: 'Hold this turn.',
    }),
  )
  if (admission.result.kind !== 'admitted') throw new Error('Private turn was not admitted.')
  const store = telegramStore(existingBatch, [existingPost], { coordinator })
  const selection: typeof S.Selection.Type = {
    ...modelSelection,
    lookedUpProjects: [
      {
        targetId: 'north-orbit',
        targetKind: 'post',
        ownerId: 'maya',
        ownerName: 'Maya',
        project: 'Orbit',
        knownLinks: [],
        version: 4,
      },
    ],
  }
  const queued = await Effect.runPromise(
    store.ports.queueProjects({ batch: existingBatch, selection }),
  )
  const context = await Effect.runPromise(store.ports.loadProject(queued.items[0]))
  const draft: typeof S.Draft.Type = {
    proposal: {
      postEdit: {
        existingPostId: 'north-orbit',
        expectedVersion: 4,
        title: 'Orbit',
        summary: 'A local-first tracker with patch export.',
        detail: 'Patch export is available.',
        sources: [{ kind: 'telegram', messageId: 'e-1' }],
      },
      resolutions: [],
      question: null,
      reason: 'Supported update.',
    },
    evidence: { messages: [], projects: [], pages: [] },
  }
  let settled = false
  const publishing = Effect.runPromise(store.ports.publishProject({ context, draft })).then(
    (value) => {
      settled = true
      return value
    },
  )
  await Promise.resolve()
  expect(settled).toBe(false)
  await Effect.runPromise(
    privateStore.ports.abortTurn({
      turn: admission.result.context.turn,
      failure: new S.Failure({ operation: 'test', message: 'release' }),
    }),
  )
  await expect(publishing).resolves.toMatchObject({ outcome: 'updated' })
  expect(store.posts[0].version).toBe(5)
})
