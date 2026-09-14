import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { afterEach, expect, it } from 'vitest'
import { Failure, type Model } from '../../shared/runtime'
import type * as S from '../schemas'
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
  await expect(runImport(input, { directory: path, batchSize: 1, model })).rejects.toThrow()
  const partial: ImportRun = JSON.parse(await readFile(join(path, 'import.json'), 'utf8'))
  expect(partial.completedMessages).toBe(1)
  expect(partial.batches.map(({ status }) => status)).toEqual(['completed', 'failed'])
  const complete = await runImport(input, { directory: path, batchSize: 1, model })
  expect(calls).toBe(4)
  expect(complete.completedMessages).toBe(3)
  await runImport(input, { directory: path, batchSize: 1, model })
  expect(calls).toBe(4)
  await expect(runImport(snapshot(['different']), { directory: path, model })).rejects.toThrow(
    'another snapshot',
  )
})
it('preserves pending candidates, questions and evidence across batches without fixture memories', async () => {
  const path = await directory()
  const input = snapshot([
    'I built Noted, an offline note transcriber.',
    'Noted is for macOS 14 and later.',
  ])
  const model: Model = (request) =>
    Effect.gen(function* () {
      if (request.task === 'selection') {
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
      const context = request.input as typeof S.ProjectContext.Type
      expect(context.memories).toEqual([])
      if (!context.selectedCandidate)
        return {
          postEdit: null,
          resolutions: [],
          question: {
            text: 'Which operating system does Noted support?',
            sources: [{ kind: 'telegram', messageId: '1' }],
          },
          reason: 'Missing platform.',
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
  const result = await runImport(input, { directory: path, batchSize: 1, model })
  expect(result.state.posts).toHaveLength(1)
  expect(result.state.candidates).toHaveLength(0)
  expect(result.state.pendingRequests[0]?.addressed).toBe(true)
  expect(Object.keys(result.state.associations)).toEqual(['1', '2'])
  expect(result.batches[0]?.result?.questions).toHaveLength(1)
  expect(result.batches[1]?.result?.notifications).toHaveLength(1)
})
it('reports unsupported inputs explicitly and leaves the raw snapshot intact', async () => {
  const input = snapshot(['', 'x'.repeat(8001), 'hello'])
  const result = await runImport(input, { directory: await directory(), model: ignore })
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
  const result = await runImport(input, { directory: await directory(), batchSize: 3, model })
  expect(result.completedMessages).toBe(4)
  expect(result.batches.map(({ status }) => status)).toEqual(['completed', 'completed'])
  expect(result.batches[0]?.result?.unresolved).toEqual([
    { messageId: '1', reason: 'Several projects share the name Orbit; no unique match.' },
  ])
  expect(result.state.posts.map(({ title }) => title)).toEqual(['Noted'])
  expect(result.batches[1]?.result?.ignored.map(({ messageId }) => messageId)).toEqual(['4'])
})
