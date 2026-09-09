// Executable example: real Smithers flow, fake Telegram/storage/web/model boundaries.
// The model replies are scripted. This tests the pipeline, not prompt quality.

import * as Action from '@smthrs/flow/Action'
import { Deferred, Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { testEngine } from '../../shared/test-engine'
import { telegramLayers } from '../agents'
import postPrompt from '../prompts/post.mdx?raw'
import selectionPrompt from '../prompts/selection.mdx?raw'
import type * as S from '../schemas'
import type { Ports } from '../tools'
import { TelegramBatch } from '../workflow'
import { batch, initialPosts, memories } from './fixtures'
import { responses } from './responses'
import { telegramStore } from './store'

it('turns a pulled batch into a new post, an updated post and one question for the right author', async () => {
  const store = telegramStore(batch, initialPosts)
  const requests: Parameters<Ports['model']>[0][] = []
  const observations: { task: string; tool: string; result: unknown }[] = []
  const writersStarted = new Set<string>()
  const bothWriters = await Effect.runPromise(Deferred.make<void>())

  const model: Ports['model'] = (request) =>
    Effect.gen(function* () {
      requests.push(request)
      if (request.task === 'selection') {
        expect(request.instruction).toContain(selectionPrompt)
        expect(request.input).toEqual(batch)
        expect(request.tools.map(({ name }) => name)).toEqual(['searchPosts'])
        const result = yield* request.callTool('searchPosts', { queries: ['Noted', 'Tab tidy'] })
        observations.push({ task: 'selection', tool: 'searchPosts', result })
        return responses.selection
      }
      expect(request.task).toBe('post')
      expect(request.instruction).toContain(postPrompt)
      const input = request.input as typeof S.ProjectContext.Type
      const author = input.work.candidate.authorId
      const response = responses.posts[author]
      if (!response) throw new Error(`Unexpected author: ${author}`)
      writersStarted.add(author)
      if (writersStarted.size === 2) yield* Deferred.succeed(bothWriters, undefined)
      yield* Deferred.await(bothWriters) // Fails by timeout if project writers become sequential.
      for (const call of response.tools) {
        const result = yield* request.callTool(call.name, call.input)
        observations.push({ task: author, tool: call.name, result })
      }
      for (const call of response.nativeTools ?? []) {
        yield* request.observe({ kind: 'native-tool', ...call })
        observations.push({ task: author, tool: call.name, result: call.output })
      }
      return response.output
    })
  const host = telegramLayers({ ...store.ports, model }).pipe(
    Layer.provideMerge(Action.layerImplementations),
    Layer.provideMerge(testEngine),
  )
  await Effect.runPromise(
    Effect.gen(function* () {
      const input = { batchId: batch.batchId, groupId: batch.groupId }
      const result = yield* TelegramBatch.execute(input, { executionId: batch.batchId })
      expect(store.retries).toEqual([])
      expect(result).toEqual({ completed: true })

      // Ordinary chatter and old context never become posts. Related messages become ONE post.
      expect(
        store.posts.map(({ authorId, title, version, summary }) => ({
          authorId,
          title,
          version,
          summary,
        })),
      ).toEqual([
        {
          authorId: 'alex',
          title: 'Noted',
          version: 1,
          summary: 'A free Mac app that transcribes voice notes offline.',
        },
        {
          authorId: 'bea',
          title: 'Tab tidy',
          version: 3,
          summary: 'A Chrome extension that groups tabs by project.',
        },
      ])
      expect(store.ignored.map((item) => item.messageId)).toEqual(['101'])
      expect(store.questions).toEqual([
        expect.objectContaining({
          authorId: 'alex',
          postId: 'batch-1:0',
          needsReply: true,
          text: 'Does Noted support Mandarin transcription?',
        }),
      ])
      expect(store.diffs).toEqual([
        {
          postId: 'tab-tidy',
          before: initialPosts[0],
          after: store.posts[1],
        },
      ])
      expect(store.sources.get('batch-1:0')).toEqual(responses.posts.alex.output.postEdit?.sources)

      // Existing targets retain scoped search; new synthetic work receives no fake web result.
      expect(observations).toEqual(
        expect.arrayContaining([
          {
            task: 'bea',
            tool: 'searchPosts',
            result: expect.objectContaining({
              items: [expect.objectContaining({ targetId: 'tab-tidy', ownerId: 'bea' })],
              nextCursor: null,
            }),
          },
        ]),
      )
      expect(observations.some(({ task }) => task === 'alex')).toBe(false)
      const writers = requests
        .filter((request) => request.task === 'post')
        .map((request) => request.input as typeof S.ProjectContext.Type)
      expect(
        writers
          .find((input) => input.work.candidate.authorId === 'alex')
          ?.messages.map((m) => m.id),
      ).toEqual(['102', '104', '105'])
      expect(writers.find((input) => input.work.candidate.authorId === 'alex')?.memories).toEqual(
        memories.alex,
      )
      expect(writers.find((input) => input.work.candidate.authorId === 'bea')?.memories).toEqual([])
      expect(
        store.progress.filter((event) => event.task === 'post' && event.status === 'done'),
      ).toHaveLength(2)

      // Redelivering the same job reuses the completed run and preserves the saved result.
      const saved = JSON.stringify(store.result())
      yield* TelegramBatch.execute(input, { executionId: batch.batchId })
      expect(JSON.stringify(store.result())).toBe(saved)
      expect(requests).toHaveLength(3)
    }).pipe(Effect.provide(host), Effect.timeout('3 seconds')),
  )
  await expect(
    `${JSON.stringify({ mode: 'scripted-model', ...store.result() }, null, 2)}\n`,
  ).toMatchFileSnapshot('./scripted.result.json')
})
