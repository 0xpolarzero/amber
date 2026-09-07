import * as Graph from '@smthrs/flow/Graph'
import { Deferred, Effect, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { AgentTurn, RetryMaintenance, type RetryInput } from './chat.workflow'
import { TelegramBatch } from './telegram.workflow'
import { layers } from './runtime'
import { validateChanges, validateDraft, validateSelection } from './guards'
import type { Ports } from './tools'
import * as S from './schemas'
import { testEngine } from './testing/engine'

const turn = { userId: 'alex', messageId: 'm4' }
const context: typeof S.Context.Type = {
  userId: 'alex',
  message: {
    id: 'm4',
    sequence: 8,
    text: 'Yes, offline. Keep my posts short. Skip the demo question.',
  },
  matches: [],
  memories: [{ id: 'style', text: 'Use plain language.' }],
  memoryVersion: 1,
  posts: [
    {
      id: 'noted',
      authorId: 'alex',
      version: 2,
      title: 'Noted',
      summary: 'Voice notes.',
      detail: 'Local notes.',
    },
  ],
  unaddressed: [{ id: 'q1', sequence: 7, text: 'Is there a demo?' }],
  recent: [
    {
      user: { id: 'u1', sequence: 1, text: 'About Noted.' },
      assistant: { id: 'a1', sequence: 2, text: 'Does it work offline?' },
    },
  ],
}
const answer: typeof S.Answer.Type = {
  text: 'Added offline support.',
  needsReply: false,
  changes: [{ postId: 'noted', expectedVersion: 2, patch: { summary: 'Offline voice notes.' } }],
}
const batch: typeof S.BatchContext.Type = {
  batchId: 'b1',
  groupId: 'g1',
  newMessageIds: ['100', '101'],
  messages: [
    {
      id: '100',
      authorId: 'alex',
      text: 'I built Noted, an offline voice-notes app.',
      replyToId: null,
      albumId: null,
    },
    {
      id: '101',
      authorId: 'bea',
      text: 'I made Paint, a drawing app.',
      replyToId: null,
      albumId: null,
    },
  ],
}
const selection: typeof S.Selection.Type = {
  candidates: [
    { authorId: 'alex', project: 'Noted', messageIds: ['100'] },
    { authorId: 'bea', project: 'Paint', messageIds: ['101'] },
  ],
  ignored: [],
}

function harness(
  options: {
    failMemory?: boolean
    invalidAnswer?: boolean
    failProject?: boolean
    empty?: boolean
    deniedTool?: boolean
  } = {},
) {
  return Effect.gen(function* () {
    const tailsStarted = yield* Deferred.make<void>()
    const projectsStarted = yield* Deferred.make<void>()
    let tailCount = 0,
      projectCount = 0,
      memoryDone = false,
      resolutionDone = false
    let retry: typeof RetryInput.Type | undefined
    const events: string[] = []
    const inputs: Record<string, unknown> = {}
    const ports: Ports = {
      loadOpening: () => Effect.succeed({ message: context.message, recent: context.recent }),
      readContext: () => Effect.succeed(context),
      readMemories: () => Effect.succeed({ memories: context.memories, version: 1 }),
      progress: ({ task, status }) =>
        Effect.sync(() => {
          events.push(`${task}:${status}`)
        }),
      readTool: () =>
        Effect.sync(() => {
          events.push('tool')
          return []
        }),
      model: (request) =>
        Effect.gen(function* () {
          const task = request.task
          inputs[task] = request.input
          if (task === 'query-planner') {
            if (options.deniedTool)
              yield* request.callTool('readPage', { url: 'https://example.com' })
            expect(request.tools).toEqual([])
            return { queries: [{ collection: 'posts', text: 'Noted offline' }] }
          }
          if (task === 'reply') {
            expect(request.tools.map((tool) => tool.name)).toEqual(['searchWeb', 'readPage'])
            return options.invalidAnswer ? { text: 'Missing fields' } : answer
          }
          if (task === 'memory' || task === 'resolution') {
            expect(events).toContain('published')
            expect(request.tools).toEqual([])
            if (options.failMemory && task === 'memory')
              return yield* Effect.fail(new S.Failure({ operation: 'memory', message: 'Quota' }))
            if (!options.failMemory && !retry) {
              if (++tailCount === 2) yield* Deferred.succeed(tailsStarted, undefined)
              yield* Deferred.await(tailsStarted)
            }
            return task === 'memory'
              ? {
                  changes: [
                    {
                      kind: 'replace',
                      id: 'style',
                      text: 'Keep posts short.',
                      evidence: 'Keep my posts short.',
                    },
                  ],
                }
              : {
                  resolutions: [
                    { messageId: 'q1', outcome: 'ignored', reason: 'User explicitly said skip.' },
                  ],
                }
          }
          if (task === 'selection')
            return options.empty
              ? {
                  candidates: [],
                  ignored: batch.newMessageIds.map((messageId) => ({
                    messageId,
                    reason: 'Chatter',
                  })),
                }
              : selection
          const input = request.input as typeof S.ProjectContext.Type
          expect(request.tools.map((tool) => tool.name)).toEqual([
            'searchWeb',
            'readPage',
            'searchMessages',
            'readMessages',
            'searchPosts',
          ])
          yield* request.callTool('searchPosts', { query: input.work.candidate.project })
          if (++projectCount === 2) yield* Deferred.succeed(projectsStarted, undefined)
          yield* Deferred.await(projectsStarted)
          if (options.failProject && input.work.candidate.authorId === 'alex')
            return yield* Effect.fail(
              new S.Failure({ operation: 'post', message: 'Provider down' }),
            )
          return {
            kind: 'post',
            existingPostId: null,
            expectedVersion: null,
            title: input.work.candidate.project,
            summary: 'A useful app.',
            detail: 'Built by the author.',
            sources: [{ kind: 'telegram', messageId: input.work.candidate.messageIds[0] }],
            question: null,
          }
        }),
      publish: () =>
        Effect.sync(() => {
          events.push('published')
          return { replyId: 'a4', text: answer.text }
        }),
      saveMemories: () =>
        Effect.sync(() => {
          memoryDone = true
          events.push('memory-saved')
          return { completed: true }
        }),
      saveResolutions: ({ proposal }) =>
        Effect.sync(() => {
          expect(proposal.resolutions[0].outcome).toBe('ignored')
          resolutionDone = true
          events.push('resolution-saved')
          return { completed: true }
        }),
      queueMaintenanceRetry: ({ input }) =>
        Effect.sync(() => {
          retry = input
          events.push('retry-memory')
          return { completed: false }
        }),
      finishTurn: () =>
        Effect.sync(() => {
          const completed = memoryDone && resolutionDone
          events.push(completed ? 'unlocked' : 'locked')
          return { completed }
        }),
      loadBatch: () => Effect.succeed(batch),
      queueProjects: ({ selection }) =>
        Effect.sync(() => ({
          batch: { batchId: batch.batchId, groupId: batch.groupId },
          items: selection.candidates.map((candidate, index) => ({
            batchId: batch.batchId,
            groupId: batch.groupId,
            candidateId: `p${index}`,
            revision: 0,
            candidate,
          })),
        })),
      loadProject: (work) =>
        Effect.succeed({
          work,
          messages: batch.messages,
          clarifications: [],
          posts: [],
          memories: [],
          unaddressed: [],
        }),
      publishProject: ({ context }) =>
        Effect.sync(() => {
          events.push(`published:${context.work.candidateId}`)
          return {
            candidateId: context.work.candidateId,
            outcome: 'created',
            postId: context.work.candidateId,
          }
        }),
      queueProjectRetry: ({ work }) =>
        Effect.sync(() => {
          events.push(`retry:${work.candidateId}`)
          return { candidateId: work.candidateId, outcome: 'retry', postId: null }
        }),
      finishBatch: ({ results }) =>
        Effect.succeed({ completed: Object.values(results).every((r) => r.outcome !== 'retry') }),
    }
    const host = layers(ports).pipe(Layer.provideMerge(testEngine))
    return { host, events, inputs, retry: () => retry }
  })
}

describe('real Smithers workflows', () => {
  it('plans both workflows without executing models', () => {
    expect(Graph.build(AgentTurn, turn).diagnostics).toEqual([])
    expect(Graph.build(TelegramBatch, { batchId: 'b1', groupId: 'g1' }).diagnostics).toEqual([])
  })
  it('gives the planner recent context, publishes before parallel tails, then unlocks', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { host, events, inputs } = yield* harness()
        yield* Effect.gen(function* () {
          const first = yield* AgentTurn.execute(turn, { executionId: 'chat' })
          const again = yield* AgentTurn.execute(turn, { executionId: 'chat' })
          expect(first).toEqual({ completed: true })
          expect(again).toEqual(first)
          expect(events.filter((event) => event === 'published')).toHaveLength(1)
          expect(inputs['query-planner']).toEqual({
            message: context.message,
            recent: context.recent,
          })
          expect(inputs.reply).toEqual(context)
          expect(inputs.memory).toMatchObject({ memories: context.memories })
          expect(events.indexOf('unlocked')).toBeGreaterThan(events.indexOf('memory-saved'))
          expect(events.indexOf('unlocked')).toBeGreaterThan(events.indexOf('resolution-saved'))
        }).pipe(Effect.provide(host))
      }).pipe(Effect.timeout('4 seconds')),
    )
  })
  it('holds the lock after failure and retries only memory without republishing', async () => {
    const options = { failMemory: true }
    await Effect.runPromise(
      Effect.gen(function* () {
        const { host, events, retry } = yield* harness(options)
        yield* Effect.gen(function* () {
          expect(yield* AgentTurn.execute(turn, { executionId: 'failed-chat' })).toEqual({
            completed: false,
          })
          expect(events).toContain('resolution-saved')
          expect(events).not.toContain('unlocked')
          options.failMemory = false
          expect(yield* RetryMaintenance.execute(retry()!, { executionId: 'retry-1' })).toEqual({
            completed: true,
          })
          expect(events.filter((event) => event === 'published')).toHaveLength(1)
          expect(events.filter((event) => event === 'resolution-saved')).toHaveLength(1)
        }).pipe(Effect.provide(host))
      }).pipe(Effect.timeout('4 seconds')),
    )
  })
  for (const option of ['invalidAnswer', 'deniedTool'] as const)
    it(`rejects ${option} before writes`, async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const { host, events } = yield* harness({ [option]: true })
          const result = yield* AgentTurn.execute(turn, { executionId: option }).pipe(
            Effect.result,
            Effect.provide(host),
          )
          expect(result._tag).toBe('Failure')
          expect(events).not.toContain('published')
          expect(events).not.toContain('memory-saved')
          expect(events).not.toContain('tool')
        }),
      )
    })
  for (const failProject of [false, true])
    it(`hands off real candidates to parallel child runs (failure=${failProject})`, async () => {
      await Effect.runPromise(
        Effect.gen(function* () {
          const { host, events } = yield* harness({ failProject })
          yield* Effect.gen(function* () {
            const result = yield* TelegramBatch.execute(
              { batchId: 'b1', groupId: 'g1' },
              { executionId: `batch-${failProject}` },
            )
            expect(result).toEqual({ completed: !failProject })
            expect(events).toContain('published:p1')
            expect(events).toContain(failProject ? 'retry:p0' : 'published:p0')
          }).pipe(Effect.provide(host))
        }).pipe(Effect.timeout('4 seconds')),
      )
    })
  it('completes an irrelevant batch without spawning post agents', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { host, events } = yield* harness({ empty: true })
        expect(
          yield* TelegramBatch.execute(
            { batchId: 'b1', groupId: 'g1' },
            { executionId: 'empty' },
          ).pipe(Effect.provide(host)),
        ).toEqual({ completed: true })
        expect(events).not.toContain('post:running')
      }),
    )
  })
  it('rejects wrong ownership, unknown evidence, stale edits and lost batch messages', () => {
    expect(() => validateChanges('alex', context, answer)).not.toThrow()
    expect(() => validateChanges('other', context, answer)).toThrow()
    expect(() =>
      validateChanges('alex', context, {
        ...answer,
        changes: [{ ...answer.changes[0], expectedVersion: 0 }],
      }),
    ).toThrow()
    expect(() =>
      validateChanges('alex', context, {
        ...answer,
        changes: [...answer.changes, ...answer.changes],
      }),
    ).toThrow()
    expect(() => validateSelection(batch, selection)).not.toThrow()
    expect(() =>
      validateSelection(batch, { ...selection, candidates: [selection.candidates[0]] }),
    ).toThrow()
    expect(() =>
      validateSelection(batch, {
        ...selection,
        candidates: [{ ...selection.candidates[0], authorId: 'bea' }],
      }),
    ).toThrow()
    const project: typeof S.ProjectContext.Type = {
      work: {
        batchId: 'b1',
        groupId: 'g1',
        candidateId: 'p0',
        revision: 0,
        candidate: selection.candidates[0],
      },
      messages: batch.messages,
      clarifications: [],
      posts: context.posts,
      memories: [],
      unaddressed: [],
    }
    const draft: typeof S.Draft.Type = {
      proposal: {
        kind: 'post',
        existingPostId: null,
        expectedVersion: null,
        title: 'Noted',
        summary: 'Notes',
        detail: 'Offline.',
        sources: [{ kind: 'telegram', messageId: '100' }],
        question: null,
      },
      evidence: { messages: [], posts: [], pages: [] },
    }
    expect(() => validateDraft(project, draft)).not.toThrow()
    const proposal = draft.proposal
    if (proposal.kind !== 'post') throw new Error('Fixture')
    expect(() =>
      validateDraft(project, {
        ...draft,
        proposal: {
          ...proposal,
          sources: [{ kind: 'web', url: 'https://invented.invalid' }],
        },
      }),
    ).toThrow()
    expect(Schema.is(S.Answer)({ text: 'unstructured' })).toBe(false)
    expect(Schema.is(S.MemoryChanges)({ changes: [{ kind: 'restore', id: 'style' }] })).toBe(false)
  })
})
