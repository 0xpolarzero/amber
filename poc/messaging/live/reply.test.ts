import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Effect } from 'effect'
import { expect, it } from 'vitest'
import type { Model } from '../../shared/runtime'
import type { ImportRun } from '../../telegram/live/import'
import { type MessagingCapture, runReply } from './reply'

it('persists actual turns across process boundaries and supplies the previous exchange', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'amber-reply-'))
  const run: ImportRun = {
    snapshotHash: 'snapshot',
    groupId: 'group',
    completedMessages: 1,
    skipped: [],
    batches: [],
    state: {
      posts: [
        {
          id: 'p1',
          authorId: 'owner',
          version: 1,
          title: 'Noted',
          summary: 'Offline notes.',
          detail: 'An offline notes application.',
        },
      ],
      candidates: [],
      pendingRequests: [],
      sources: {},
      associations: {},
    },
  }
  let recent = 0
  const model: Model = (request) =>
    Effect.sync(() => {
      if (request.task === 'query-planner') {
        recent = (request.input as { recentExchanges: unknown[] }).recentExchanges.length
        return { queries: [] }
      }
      if (request.task === 'responder')
        return {
          text: 'Noted.',
          intent: 'informational',
          classification: 'answer',
          postChanges: [],
          pendingOutcome: { kind: 'none' },
        }
      if (request.task === 'memory') return { operations: [] }
      return { resolutions: [] }
    })
  try {
    await mkdir(join(directory, 'import'))
    await writeFile(join(directory, 'import/import.json'), JSON.stringify(run))
    const first = await runReply({ authorId: 'owner', text: 'Hello.' }, { directory, model })
    expect(first.turns[0]?.receipt.status).toBe('completed')
    expect(recent).toBe(0)
    await runReply({ authorId: 'owner', text: 'Thanks.' }, { directory, model })
    expect(recent).toBe(1)
    const saved: MessagingCapture = JSON.parse(
      await readFile(join(directory, 'messaging.json'), 'utf8'),
    )
    expect(saved.state.messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
    ])
    expect(saved.state.memories).toEqual([])
    expect(saved.turns).toHaveLength(2)
    await expect(
      runReply({ authorId: 'stranger', text: 'Change that post.' }, { directory, model }),
    ).rejects.toThrow('Choose an author')
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
