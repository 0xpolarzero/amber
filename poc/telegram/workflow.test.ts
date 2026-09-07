// Real Gemini decisions; fictional Telegram messages, web pages and in-memory storage.
import { writeFile } from 'node:fs/promises'
import * as Action from '@smthrs/flow/Action'
import { Effect, Layer } from 'effect'
import { expect, it } from 'vitest'
import { telegramLayers } from './agents'
import { antigravity, modelId } from './antigravity'
import { testEngine } from './testing/engine'
import { batch, initialPosts } from './testing/fixtures'
import { telegramStore } from './testing/store'
import type { Ports } from './tools'
import { TelegramBatch } from './workflow'

it('uses Gemini to create Alex’s post, update Bea’s post and ignore unrelated chatter', async () => {
  const store = telegramStore(batch, initialPosts)
  const answers: { task: string; input: unknown; output: unknown }[] = []
  const research: { task: string; tool: string; input: unknown; output: unknown }[] = []
  const model: Ports['model'] = (request) =>
    antigravity({
      ...request,
      callTool: (tool, input) =>
        request.callTool(tool, input).pipe(
          Effect.tap((output) =>
            Effect.sync(() => {
              research.push({ task: request.task, tool, input, output })
              console.info(`  ${tool} ${JSON.stringify(input)}`)
            }),
          ),
        ),
    }).pipe(
      Effect.tap((output) =>
        Effect.sync(() => {
          answers.push({ task: request.task, input: request.input, output })
        }),
      ),
    )
  const host = telegramLayers({
    ...store.ports,
    model,
    progress: (event) =>
      store.ports.progress(event).pipe(
        Effect.tap(() =>
          Effect.sync(() => {
            console.info(`${event.task} ${event.scope.userId ?? 'batch'}: ${event.status}`)
          }),
        ),
      ),
  }).pipe(Layer.provideMerge(Action.layerImplementations), Layer.provideMerge(testEngine))

  const receipt = await Effect.runPromise(
    TelegramBatch.execute(batch, { executionId: batch.batchId }).pipe(
      Effect.provide(host),
      Effect.timeout('5 minutes'),
    ),
  )
  // This is an observation for human review, never an exact-text expectation.
  await writeFile(
    new URL('./result.json', import.meta.url),
    `${JSON.stringify(
      {
        mode: 'live-model',
        model: modelId,
        receipt,
        retries: store.retries,
        ...store.result(),
        answers,
        research,
        progress: store.progress,
      },
      null,
      2,
    )}\n`,
  )

  expect(store.retries).toEqual([])
  expect(receipt.completed).toBe(true)
  expect(answers).toHaveLength(3)
  expect(store.posts.map((post) => post.authorId)).toEqual(['alex', 'bea'])
  expect(store.posts[0]).toMatchObject({ version: 1 })
  expect(store.posts[1]).toMatchObject({ id: 'tab-tidy', version: 3 })
  expect(store.diffs).toHaveLength(1)
  expect(store.ignored.map((item) => item.messageId)).toContain('101')
  expect(research.some((call) => call.tool === 'readPage')).toBe(true)
  expect(research.some((call) => call.tool === 'searchPosts')).toBe(true)
  // The open language-support question belongs to the maker, never the person who asked it.
  expect(store.questions).toEqual([expect.objectContaining({ authorId: 'alex', needsReply: true })])
}, 330_000)
