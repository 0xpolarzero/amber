import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { afterEach, expect, it } from 'vitest'
import { Failure, type Model } from '../../shared/runtime'
import type * as S from '../schemas'
import { withQuality } from '../testing/quality-model'
import { type ImportRun, runImport } from './import'
import type { Snapshot } from './snapshot'

const directories: string[] = []
afterEach(async () => {
  await Promise.all(
    directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })),
  )
})
async function directory() {
  const path = await mkdtemp(join(tmpdir(), 'amber-import-'))
  directories.push(path)
  return path
}
const snapshot = (texts: string[]): Snapshot => ({
  version: 1,
  groupId: 'group',
  groupName: 'Agent junkies',
  importedAt: '2026-09-14T00:00:00Z',
  accountId: 'alex',
  requestedCount: 500,
  authors: { alex: { name: 'Alex' } },
  messages: texts.map((text, index) => ({
    id: String(index + 1),
    authorId: 'alex',
    text,
    replyToId: null,
    albumId: null,
    date: `2026-09-14T00:00:0${index}Z`,
    sourceUrl: null,
    media: !text,
    service: false,
  })),
})
const ignore: Model = (request) =>
  Effect.sync(() => {
    const input = request.input as typeof S.BatchContext.Type
    return {
      candidates: [],
      unresolved: [],
      ignored: input.newMessageIds.map((messageId) => ({
        messageId,
        category: 'chatter',
        reason: 'No project evidence.',
      })),
    }
  })
it('commits bounded batches and resumes without repeating completed model calls', async () => {
  const path = await directory()
  const input = snapshot(['hello', 'thanks', 'bye'])
  let calls = 0
  const model: Model = (request) => {
    calls++
    return calls === 2
      ? Effect.fail(new Failure({ operation: 'provider', message: 'Temporary failure' }))
      : ignore(request)
  }
  await expect(
    runImport(input, { directory: path, batchSize: 1, model: withQuality(model) }),
  ).rejects.toThrow()
  const partial: ImportRun = JSON.parse(await readFile(join(path, 'import.json'), 'utf8'))
  expect(partial.completedMessages).toBe(1)
  expect(partial.batches.map(({ status }) => status)).toEqual(['completed', 'failed'])
  const complete = await runImport(input, {
    directory: path,
    batchSize: 1,
    model: withQuality(model),
  })
  expect(calls).toBe(4)
  expect(complete.completedMessages).toBe(3)
  await runImport(input, { directory: path, batchSize: 1, model: withQuality(model) })
  expect(calls).toBe(4)
  await expect(
    runImport(snapshot(['different']), { directory: path, model: withQuality(model) }),
  ).rejects.toThrow('another snapshot')
})
it('preserves pending candidates, questions and evidence across batches without fixture memories', async () => {
  const path = await directory()
  const input = snapshot([
    'I built Noted, an offline note transcriber.',
    'Noted is for macOS 14 and later.',
  ])
  let selections = 0
  let failWriter = true
  const model: Model = (request) =>
    Effect.gen(function* () {
      if (request.task === 'selection') {
        selections++
        const batch = request.input as typeof S.BatchContext.Type
        const existing = batch.newMessageIds[0] === '2'
        const found = existing
          ? ((yield* request.callTool('searchPosts', {
              queries: ['Noted'],
            })) as typeof S.ProjectSearchPage.Type)
          : null
        return {
          candidates: [
            {
              authorId: 'alex',
              project: 'Noted',
              messageIds: batch.newMessageIds,
              target: found
                ? { kind: 'existing', targetId: found.items[0]?.targetId }
                : { kind: 'new', ownerId: 'alex' },
            },
          ],
          ignored: [],
          unresolved: [],
        }
      }
      if (failWriter) {
        failWriter = false
        return yield* Effect.fail(
          new Failure({ operation: 'provider', message: 'Transient writer failure' }),
        )
      }
      const context = request.input as typeof S.ProjectContext.Type
      expect(context.memories).toEqual([])
      if (!context.selectedCandidate) {
        const proposal = {
          postEdit: null,
          resolutions: [],
          question: {
            text: 'Which operating system does Noted support?',
            sources: [{ kind: 'telegram', messageId: '1' }],
          },
          reason: 'Missing platform.',
        }
        expect(request.validateResult).toBeTypeOf('function')
        const rejected = yield* Effect.result(
          request.validateResult?.({
            ...proposal,
            question: {
              text: proposal.question.text,
              sources: [{ kind: 'telegram', messageId: 'missing' }],
            },
          }) as Effect.Effect<void, Failure>,
        )
        expect(rejected._tag).toBe('Failure')
        yield* request.validateResult?.(proposal) as Effect.Effect<void, Failure>
        return proposal
      }
      expect(context.messages.map(({ id }) => id)).toEqual(['1', '2'])
      return {
        postEdit: {
          existingPostId: null,
          expectedVersion: context.selectedCandidate.version,
          title: 'Noted',
          summary: 'Offline note transcription for macOS.',
          detail: 'Requires macOS 14 or later.',
          sources: [
            { kind: 'telegram', messageId: '1' },
            { kind: 'telegram', messageId: '2' },
          ],
        },
        question: null,
        resolutions: [
          {
            requestMessageId: context.pendingRequests[0]?.id,
            outcome: 'answered',
            reason: 'Owner supplied platform.',
            sources: [{ kind: 'telegram', messageId: '2' }],
          },
        ],
        reason: 'Enough detail to publish.',
      }
    })
  await expect(
    runImport(input, { directory: path, batchSize: 1, model: withQuality(model) }),
  ).rejects.toThrow('Batch needs review')
  const result = await runImport(input, {
    directory: path,
    batchSize: 1,
    model: withQuality(model),
  })
  expect(selections).toBe(2)
  expect(result.batches[1]?.calls[0]?.reusedFromBatch).toBe(0)
  expect(result.state.posts).toHaveLength(1)
  expect(result.state.candidates).toHaveLength(0)
  expect(result.state.pendingRequests[0]?.addressed).toBe(true)
  expect(Object.keys(result.state.associations)).toEqual(['1', '2'])
  expect(result.batches[1]?.result?.questions).toHaveLength(1)
  expect(result.batches[2]?.result?.notifications).toHaveLength(1)
})
it('reports unsupported inputs explicitly and leaves the raw snapshot intact', async () => {
  const input = snapshot(['', 'x'.repeat(8001), 'hello'])
  const result = await runImport(input, {
    directory: await directory(),
    model: withQuality(ignore),
  })
  expect(result.skipped.map(({ messageId }) => messageId)).toEqual(['1', '2'])
  expect(result.completedMessages).toBe(1)
  expect(input.messages[1]?.text.length).toBe(8001)
})

it('records unresolved identity while publishing independent work and continuing later batches', async () => {
  const input = snapshot([
    'Orbit now exports files.',
    'I built Noted, an offline Mac note transcriber.',
    'thanks',
    'hello',
  ])
  const model: Model = (request) => {
    if (request.task === 'selection') {
      const batch = request.input as typeof S.BatchContext.Type
      if (!batch.newMessageIds.includes('1')) return ignore(request)
      return Effect.succeed({
        candidates: [
          {
            authorId: 'alex',
            project: 'Noted',
            messageIds: ['2'],
            target: { kind: 'new', ownerId: 'alex' },
          },
        ],
        ignored: [{ messageId: '3', category: 'chatter', reason: 'Acknowledgement.' }],
        unresolved: [
          { messageId: '1', reason: 'Several projects share the name Orbit; no unique match.' },
        ],
      })
    }
    return Effect.succeed({
      postEdit: {
        existingPostId: null,
        expectedVersion: null,
        title: 'Noted',
        summary: 'An offline Mac note transcriber.',
        detail: 'Transcribes notes locally on Mac.',
        sources: [{ kind: 'telegram', messageId: '2' }],
      },
      resolutions: [],
      question: null,
      reason: 'Firsthand project announcement.',
    })
  }
  const result = await runImport(input, {
    directory: await directory(),
    batchSize: 3,
    model: withQuality(model),
  })
  expect(result.completedMessages).toBe(4)
  expect(result.batches.map(({ status }) => status)).toEqual(['completed', 'completed'])
  expect(result.batches[0]?.result?.unresolved).toEqual([
    { messageId: '1', reason: 'Several projects share the name Orbit; no unique match.' },
  ])
  expect(result.state.posts.map(({ title }) => title)).toEqual(['Noted'])
  expect(result.batches[1]?.result?.ignored.map(({ messageId }) => messageId)).toEqual(['4'])
})

it('excludes known bots before model selection while retaining human and unknown senders', async () => {
  const input = snapshot(['I built a new release!', 'Human message', 'Unknown sender message'])
  input.authors = {
    alex: { name: 'Release notifier', bot: true },
    human: { name: 'Human', bot: false },
  }
  input.messages[1].authorId = 'human'
  input.messages[2].authorId = 'unknown'
  const seen: string[][] = []
  const model: Model = (request) => {
    const batch = request.input as typeof S.BatchContext.Type
    seen.push(batch.messages.map(({ id }) => id))
    return ignore(request)
  }
  const result = await runImport(input, { directory: await directory(), model })
  expect(seen).toEqual([['2', '3']])
  expect(result.skipped).toEqual([
    { messageId: '1', reason: 'Automated bot message; not a firsthand human creation' },
  ])
  expect(result.completedMessages).toBe(2)
  expect(result.state.posts).toEqual([])
  expect(result.state.pendingRequests).toEqual([])
})
