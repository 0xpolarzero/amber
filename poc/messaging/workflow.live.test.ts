// Live behavioral proof: real Gemini requests, invented Amber records, in-memory application seams.
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import * as Action from '@smthrs/flow/Action'
import { Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { antigravity, modelId } from '../shared/antigravity'
import { testEngine } from '../shared/test-engine'
import { messagingLayers } from './agents'
import type * as S from './schemas'
import { fixture, userId } from './testing/fixtures'
import { messagingStore } from './testing/store'
import type { Ports } from './tools'
import { MessagingTurn } from './workflow'

const sourceFiles = [
  'workflow.ts',
  'agents.ts',
  'model.ts',
  'schemas.ts',
  'testing/store.ts',
  'prompts/query-planner.mdx',
  'prompts/responder.mdx',
  'prompts/memory.mdx',
  'prompts/addressing.mdx',
] as const

const visibleState = (snapshot: ReturnType<ReturnType<typeof messagingStore>['snapshot']>) => ({
  posts: snapshot.posts,
  memories: snapshot.memories,
  candidates: snapshot.candidates,
  requests: snapshot.messages.filter(
    ({ id, turnId }) => id.startsWith('live-request-') || turnId?.startsWith('live-turn-'),
  ),
  addressing: snapshot.addressing,
})

it('runs two related Amber turns through all four real model tasks', async () => {
  const store = messagingStore(fixture)
  store.admitAgentMessage({
    id: 'live-request-license',
    userId,
    text: 'Which license will Clipwise use?',
    intent: 'question',
    pendingCandidateId: 'candidate-clipwise',
  })
  store.admitAgentMessage({
    id: 'live-request-language',
    userId,
    text: 'Does Noted support Mandarin?',
    intent: 'question',
    linkedPostId: 'noted',
  })
  store.admitAgentMessage({
    id: 'live-request-team',
    userId,
    text: 'Should Atlas support team workspaces?',
    intent: 'suggestion',
    linkedPostId: 'atlas',
  })
  store.admitAgentMessage({
    id: 'live-request-exports',
    userId,
    text: 'Which three export formats will Noted support?',
    intent: 'question',
    linkedPostId: 'noted',
  })
  const calls: { task: string; input: unknown; output: unknown }[] = []
  const model: Ports['model'] = (request) =>
    antigravity(request).pipe(
      Effect.tap((output) =>
        Effect.sync(() => {
          calls.push({ task: request.task, input: request.input, output })
        }),
      ),
    )
  const host = messagingLayers({ ...store.ports, model }).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(testEngine),
  )
  const inputs = [
    {
      turnId: 'live-turn-1',
      userId,
      text: 'Noted supports Mandarin. Clipwise uses the MIT license and is free, so publish it. Ignore the Atlas team-workspace suggestion. Prefer detailed factual posts and forget my macOS-only preference.',
    },
    {
      turnId: 'live-turn-2',
      userId,
      text: 'Update Atlas to say it works offline and Noted to emphasize on-device transcription. PDF export is planned for the next release; defer the other export formats. Aurora should stay invite-only, as I said before. I no longer want detailed posts; keep them concise.',
    },
  ] as const
  const receipts: (typeof S.TurnReceipt.Type)[] = []
  const turns: unknown[] = []
  for (const input of inputs) {
    const before = store.snapshot()
    const callStart = calls.length
    const progressStart = store.progress.length
    const receipt = await Effect.runPromise(
      MessagingTurn.execute(input, { executionId: input.turnId }).pipe(
        Effect.provide(host),
        Effect.timeout('6 minutes'),
      ),
    )
    receipts.push(receipt)
    turns.push({
      input,
      receipt,
      calls: calls.slice(callStart),
      progress: store.progress.slice(progressStart),
      before: visibleState(before),
      after: visibleState(store.snapshot()),
    })
  }
  const snapshot = store.snapshot()
  const sourceProvenance = Object.fromEntries(
    await Promise.all(
      sourceFiles.map(async (file) => {
        const body = await readFile(new URL(file, import.meta.url))
        return [file, `sha256:${createHash('sha256').update(body).digest('hex')}`]
      }),
    ),
  )
  await writeFile(
    new URL('./result.json', import.meta.url),
    `${JSON.stringify(
      {
        mode: 'live-model',
        provenance: {
          model: modelId,
          provider: 'Google subscription through Antigravity CLI',
          storage: 'invented in-memory fixture; not deployed durability',
          scripted: false,
        },
        inputs,
        receipts,
        calls,
        turns,
        progress: store.progress,
        observations: store.observations,
        final: snapshot,
        sourceProvenance,
        limits: {
          recentCompletedExchanges: 3,
          plannedQueries: 6,
          perQueryResults: 10,
          linkedRequestPosts: 20,
          responderResearchCalls: 8,
          backgroundAttempts: 2,
          storage:
            'In-memory proof only; production needs transactional DB admission and a durable queue.',
        },
      },
      null,
      2,
    )}\n`,
  )

  expect(receipts.every(({ status }) => status === 'completed')).toBe(true)
  expect(calls).toHaveLength(8)
  for (const task of ['query-planner', 'responder', 'memory', 'addressing'])
    expect(calls.filter((call) => call.task === task)).toHaveLength(2)
  const first = snapshot.turns['live-turn-1']
  const second = snapshot.turns['live-turn-2']
  const publication = first.published?.candidatePublications.find(
    ({ candidateId }) => candidateId === 'candidate-clipwise',
  )
  expect(publication).toBeDefined()
  const clipwise = snapshot.posts.find(({ id }) => id === publication?.postId)
  expect(clipwise).toMatchObject({ published: true })
  expect(`${clipwise?.summary} ${clipwise?.detail}`).toMatch(/free/i)
  expect(`${clipwise?.summary} ${clipwise?.detail}`).toMatch(/MIT/i)
  expect(first.published?.diffs.map(({ postId }) => postId)).toContain('noted')
  expect(first.published?.diffs.find(({ postId }) => postId === 'noted')?.after.detail).toMatch(
    /Mandarin/i,
  )
  expect(first.published?.response.text).not.toMatch(/free license/i)
  expect(first.published?.response.text).not.toMatch(
    /preferences? (?:were |was |have been )?(?:saved|updated|deleted)/i,
  )
  expect(first.published?.response.text).not.toMatch(/dismissed|closed/i)
  expect(snapshot.candidates.find(({ id }) => id === 'candidate-clipwise')?.status).toBe(
    'published',
  )
  expect(second.published?.diffs.length).toBeGreaterThanOrEqual(2)
  expect(second.published?.diffs.map(({ postId }) => postId)).toEqual(
    expect.arrayContaining(['atlas', 'noted', 'aurora']),
  )
  expect(snapshot.posts.find(({ id }) => id === 'atlas')?.detail).toMatch(/offline/i)
  expect(snapshot.posts.find(({ id }) => id === 'aurora')?.detail).toMatch(/invite-only/i)
  const noted = snapshot.posts.find(({ id }) => id === 'noted')
  expect(`${noted?.summary} ${noted?.detail}`).toMatch(/on-device/i)
  expect(`${noted?.summary} ${noted?.detail}`).toMatch(/PDF/i)
  expect(`${noted?.summary} ${noted?.detail}`).toMatch(/planned|next release|future/i)
  expect(`${noted?.summary} ${noted?.detail}`).not.toMatch(/supports? PDF/i)
  expect(second.published?.response.text).not.toMatch(
    /preferences? (?:were |was |have been )?(?:saved|updated|deleted)/i,
  )
  expect(snapshot.messages.find(({ id }) => id === 'live-request-language')?.addressed).toBe(true)
  expect(snapshot.addressing['live-request-team']?.outcome).toBe('ignored')
  expect(snapshot.addressing['live-request-license']?.outcome).toBe('answered')
  expect(snapshot.messages.find(({ id }) => id === 'live-request-exports')?.addressed).toBe(false)
  expect(
    snapshot.messages.filter(
      ({ role, text }) =>
        role === 'assistant' && text.includes('Which three export formats will Noted support?'),
    ),
  ).toHaveLength(1)
  expect(
    snapshot.memories
      .filter(({ userId: owner }) => owner === userId)
      .some(({ text }) => /concise|short/i.test(text)),
  ).toBe(true)
  const secondResponder = calls.filter(({ task }) => task === 'responder')[1]
    ?.input as typeof S.ResponderContext.Type
  expect(secondResponder.queryResults.userMessages.map(({ id }) => id)).toContain('history-1:user')
  const firstResponder = calls.find(({ task }) => task === 'responder')
    ?.input as typeof S.ResponderContext.Type
  expect(firstResponder.queryResults.posts.map(({ id }) => id)).toEqual(
    expect.arrayContaining(['noted', 'atlas']),
  )
  expect(firstResponder.queryResults.linkedRequestPostIds).toEqual(
    expect.arrayContaining(['noted', 'atlas']),
  )
  for (const turnId of ['live-turn-1', 'live-turn-2']) {
    const events = store.progress.filter((event) => event.turnId === turnId)
    const memoryStart = events.findIndex(
      ({ task, status }) => task === 'memory' && status === 'running',
    )
    const addressingStart = events.findIndex(
      ({ task, status }) => task === 'addressing' && status === 'running',
    )
    const firstDone = events.findIndex(
      ({ task, status }) => ['memory', 'addressing'].includes(task) && status === 'done',
    )
    expect(Math.max(memoryStart, addressingStart)).toBeLessThan(firstDone)
    const publicationDone = events.findIndex(
      ({ task, status }) => task === 'publication' && status === 'done',
    )
    const finalizeDone = events.findIndex(
      ({ task, status }) => task === 'finalize' && status === 'done',
    )
    expect(publicationDone).toBeLessThan(Math.min(memoryStart, addressingStart))
    expect(finalizeDone).toBeGreaterThan(firstDone)
  }
  const responderConfig = store.observations.find(
    ({ task, observation }) => task === 'responder' && observation.kind === 'configuration',
  )?.observation
  expect(responderConfig).toMatchObject({
    kind: 'configuration',
    model: modelId,
    declaredTools: ['finish', 'search_web', 'read_url_content', 'amber/readFetchedPage'],
  })
}, 750_000)
