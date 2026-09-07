import { createHash, randomBytes } from 'node:crypto'
import * as FlowEngine from '@smthrs/engine/FlowEngine'
import * as Graph from '@smthrs/flow/Graph'
import { Crypto, Deferred, Effect, Layer, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Addressed,
  AgentTurn,
  Answer,
  Context,
  ExtractMemories,
  Failure,
  layers,
  Memories,
  Queries,
  PlanQueries,
  prompts,
  ResolveMessages,
  validateChanges,
  WriteAnswer,
  type Ports,
} from './workflow'

const turn = { userId: 'alex', messageId: 'm4' }
const context: typeof Context.Type = {
  userId: 'alex',
  message: { id: 'm4', sequence: 8, text: 'It works offline. Keep my posts short.' },
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
  unaddressed: [{ id: 'q1', sequence: 7, text: 'Does Noted work offline?' }],
  recent: Array.from({ length: 3 }, (_, i) => ({
    user: { id: `u${i}`, sequence: i * 2, text: 'Earlier user message.' },
    assistant: { id: `a${i}`, sequence: i * 2 + 1, text: 'Earlier answer.' },
  })),
}
const answer: typeof Answer.Type = {
  text: 'Added that it works offline.',
  needsReply: false,
  changes: [{ postId: 'noted', expectedVersion: 2, patch: { summary: 'Offline voice notes.' } }],
}
const crypto = Layer.succeed(
  Crypto.Crypto,
  Crypto.make({
    randomBytes: (size) => randomBytes(size),
    digest: (algorithm, data) =>
      Effect.sync(
        () => new Uint8Array(createHash(algorithm.replace('-', '')).update(data).digest()),
      ),
  }),
)

function harness(options: { failMemory?: boolean; invalidAnswer?: boolean } = {}) {
  return Effect.gen(function* () {
    const bothStarted = yield* Deferred.make<void>()
    const events: string[] = []
    const inputs: Record<string, unknown> = {}
    let started = 0
    const ports: Ports = {
      loadMessage: () =>
        Effect.sync(() => {
          events.push('load')
          return context.message
        }),
      readContext: () =>
        Effect.sync(() => {
          events.push('context')
          return context
        }),
      model: (request) =>
        Effect.gen(function* () {
          const stage = Object.entries(prompts).find(([, prompt]) =>
            request.instruction.startsWith(prompt),
          )?.[0]
          if (!stage)
            return yield* Effect.fail(new Failure({ operation: 'model', message: 'Unknown task' }))
          events.push(stage)
          inputs[stage] = request.input
          if (stage === 'queries')
            return { queries: [{ collection: 'posts', text: 'Noted offline' }] }
          if (stage === 'answer') return options.invalidAnswer ? { text: 'missing fields' } : answer
          expect(events).toContain('published')
          if (options.failMemory && stage === 'memory')
            return yield* Effect.fail(
              new Failure({ operation: 'memory', message: 'Quota exhausted' }),
            )
          if (!options.failMemory) {
            started++
            if (started === 2) yield* Deferred.succeed(bothStarted, undefined)
            yield* Deferred.await(bothStarted)
          }
          return stage === 'memory'
            ? { memories: [{ text: 'Keep descriptions short.', evidence: 'Keep my posts short.' }] }
            : { messageIds: ['q1'] }
        }),
      publish: () =>
        Effect.sync(() => {
          events.push('published')
          return { replyId: 'a4', text: answer.text }
        }),
      saveMemories: () =>
        Effect.sync(() => {
          events.push('memory-saved')
          return { completed: true }
        }),
      markAnswered: () =>
        Effect.sync(() => {
          events.push('marked-answered')
          return { completed: true }
        }),
      deferMaintenance: ({ branch }) =>
        Effect.sync(() => {
          events.push(`retry:${branch}`)
          return { completed: false }
        }),
    }
    const host = layers(ports).pipe(
      Layer.provideMerge(FlowEngine.layerMemory),
      Layer.provideMerge(crypto),
    )
    return { events, inputs, host }
  })
}

describe('real Smithers reference', () => {
  it('plans four model tasks with publication before independent maintenance branches', () => {
    const graph = Graph.build(AgentTurn, turn)
    expect(graph.diagnostics).toEqual([])
    const steps = graph.nodes.filter((node) => node.kind === 'ActionCall')
    expect(steps.map((node) => node.ast._tag === 'ActionCall' && node.ast.action)).toEqual([
      'amber/load-message',
      'amber/plan-queries',
      'amber/read-context',
      'amber/write-answer',
      'amber/publish',
      'amber/extract-memories',
      'amber/save-memories',
      'amber/defer-maintenance',
      'amber/resolve-messages',
      'amber/mark-answered',
      'amber/defer-maintenance',
    ])
    expect(PlanQueries.successSchema).toBe(Queries)
    expect(WriteAnswer.successSchema).toBe(Answer)
    expect(ExtractMemories.successSchema).toBe(Memories)
    expect(ResolveMessages.successSchema).toBe(Addressed)
    expect(Schema.is(PlanQueries.successSchema)({ queries: [] })).toBe(true)
    expect(Schema.is(WriteAnswer.successSchema)(answer)).toBe(true)
    expect(Schema.is(ExtractMemories.successSchema)({ memories: [] })).toBe(true)
    expect(Schema.is(ResolveMessages.successSchema)({ messageIds: [] })).toBe(true)
    expect(Schema.is(Answer)({ text: 'unstructured' })).toBe(false)
  })

  it('sends exact context, publishes first, runs both tails concurrently and reuses a completed execution', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { events, inputs, host } = yield* harness()
        yield* Effect.gen(function* () {
          const first = yield* AgentTurn.execute(turn, { executionId: 'turn-m4' })
          const second = yield* AgentTurn.execute(turn, { executionId: 'turn-m4' })
          expect(first).toEqual({ memory: { completed: true }, addressed: { completed: true } })
          expect(second).toEqual(first)
          expect(events.filter((event) => event === 'published')).toHaveLength(1)
          expect(events.filter((event) => event === 'queries')).toHaveLength(1)
          expect(events.slice(0, 5)).toEqual(['load', 'queries', 'context', 'answer', 'published'])
          expect(inputs.queries).toEqual({ message: context.message })
          expect(inputs.answer).toEqual(context)
          expect(Object.keys(inputs.memory as object).sort()).toEqual(['answer', 'message'])
          expect(Object.keys(inputs.addressed as object).sort()).toEqual([
            'answer',
            'message',
            'unaddressed',
          ])
        }).pipe(Effect.provide(host))
      }).pipe(Effect.timeout('3 seconds')),
    )
  })

  it('keeps the published answer and resolution when memory extraction fails', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { events, host } = yield* harness({ failMemory: true })
        const result = yield* AgentTurn.execute(turn, { executionId: 'memory-failure' }).pipe(
          Effect.provide(host),
        )
        expect(result).toEqual({ memory: { completed: false }, addressed: { completed: true } })
        expect(events).toContain('published')
        expect(events).toContain('marked-answered')
        expect(events).toContain('retry:memory')
        expect(events).not.toContain('memory-saved')
      }),
    )
  })

  it('never publishes a malformed answer or starts its background tasks', async () => {
    await Effect.runPromise(
      Effect.gen(function* () {
        const { events, host } = yield* harness({ invalidAnswer: true })
        const result = yield* AgentTurn.execute(turn, { executionId: 'invalid-answer' }).pipe(
          Effect.result,
          Effect.provide(host),
        )
        expect(result._tag).toBe('Failure')
        expect(events).toEqual(['load', 'queries', 'context', 'answer'])
      }),
    )
  })

  it('rejects unknown, foreign, stale and duplicate post changes', () => {
    expect(() => validateChanges('alex', context, answer)).not.toThrow()
    for (const change of [
      { ...answer.changes[0], postId: 'unknown' },
      { ...answer.changes[0], expectedVersion: 0 },
      { ...answer.changes[0], patch: {} },
    ])
      expect(() => validateChanges('alex', context, { ...answer, changes: [change] })).toThrow()
    expect(() => validateChanges('someone-else', context, answer)).toThrow()
    expect(() =>
      validateChanges('alex', context, {
        ...answer,
        changes: [...answer.changes, ...answer.changes],
      }),
    ).toThrow()
    expect(Schema.is(Context)({ ...context, recent: [...context.recent, context.recent[0]] })).toBe(
      false,
    )
    expect(Schema.is(Memories)({ memories: [{ text: 'No evidence' }] })).toBe(false)
    expect(Schema.is(Addressed)({ messageIds: [5] })).toBe(false)
  })
})
