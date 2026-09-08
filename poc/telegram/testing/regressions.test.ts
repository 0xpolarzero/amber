import * as Action from '@smthrs/flow/Action'
import * as Graph from '@smthrs/flow/Graph'
import { Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { testEngine } from '../../shared/test-engine'
import { telegramLayers } from '../agents'
import { validateDraft, validateSelection } from '../guards'
import * as S from '../schemas'
import type { Ports } from '../tools'
import { TelegramBatch } from '../workflow'
import { batch, initialPosts } from './fixtures'
import { responses } from './responses'
import { telegramStore } from './store'

it('plans the batch without executing models', () => {
  expect(Graph.build(TelegramBatch, batch).diagnostics).toEqual([])
})

it.each(['irrelevant', 'failed-project'] as const)('handles an %s batch', async (scenario) => {
  const store = telegramStore(batch, initialPosts)
  const model: Ports['model'] = (request) =>
    Effect.gen(function* () {
      if (request.task === 'selection')
        return scenario === 'irrelevant'
          ? {
              candidates: [],
              ignored: batch.newMessageIds.map((messageId) => ({ messageId, reason: 'Chatter' })),
            }
          : responses.selection
      const context = request.input as typeof S.ProjectContext.Type
      if (context.work.candidate.authorId === 'alex')
        return yield* Effect.fail(new S.Failure({ operation: 'post', message: 'Provider down' }))
      const response = responses.posts.bea
      for (const call of response.tools) yield* request.callTool(call.name, call.input)
      return response.output
    })
  const host = telegramLayers({ ...store.ports, model }).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(testEngine),
  )
  const result = await Effect.runPromise(
    TelegramBatch.execute(batch, { executionId: scenario }).pipe(
      Effect.provide(host),
      Effect.timeout('3 seconds'),
    ),
  )
  expect(result.completed).toBe(scenario === 'irrelevant')
  if (scenario === 'irrelevant') {
    expect(store.posts).toEqual(initialPosts)
    expect(store.progress.some((event) => event.task === 'post')).toBe(false)
  } else {
    expect(store.retries).toEqual(['Provider down'])
    expect(store.posts).toHaveLength(1)
    expect(store.posts[0]).toMatchObject({ id: 'tab-tidy', version: 3 })
    expect(store.progress).toContainEqual(
      expect.objectContaining({ task: 'post', status: 'failed' }),
    )
  }
})

it('rejects missing messages, wrong ownership, invented evidence and stale updates', () => {
  expect(() => validateSelection(batch, responses.selection)).not.toThrow()
  expect(() => validateSelection(batch, { candidates: [], ignored: [] })).toThrow()
  expect(() =>
    validateSelection(batch, {
      ...responses.selection,
      candidates: [{ ...responses.selection.candidates[0], authorId: 'bea' }],
    }),
  ).toThrow()
  const context: typeof S.ProjectContext.Type = {
    work: {
      batchId: batch.batchId,
      groupId: batch.groupId,
      candidateId: 'batch-1:1',
      revision: 0,
      candidate: responses.selection.candidates[1],
    },
    messages: batch.messages,
    posts: initialPosts,
    memories: [],
    clarifications: [],
    unaddressed: [],
  }
  const draft = {
    proposal: responses.posts.bea.output,
    evidence: { messages: [], posts: [], pages: [] },
  }
  expect(() => validateDraft(context, draft)).not.toThrow()
  expect(() =>
    validateDraft(context, {
      ...draft,
      proposal: { ...draft.proposal, sources: [{ kind: 'web', url: 'https://invented.invalid' }] },
    }),
  ).toThrow()
  expect(() =>
    validateDraft(context, { ...draft, proposal: { ...draft.proposal, expectedVersion: 0 } }),
  ).toThrow()
})
