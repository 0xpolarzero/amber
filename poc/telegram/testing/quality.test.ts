import { Effect } from 'effect'
import { expect, it } from 'vitest'
import type { ModelPorts } from '../model'
import { reviewedPost } from '../quality'
import type * as S from '../schemas'

const context: typeof S.ProjectContext.Type = {
  work: {
    batchId: 'batch',
    groupId: 'group',
    candidateId: 'candidate',
    revision: 0,
    ownerId: 'owner',
    candidate: {
      authorId: 'owner',
      project: 'Demo',
      messageIds: ['m1'],
      target: { kind: 'new', ownerId: 'owner' },
    },
  },
  messages: [
    {
      id: 'm1',
      authorId: 'owner',
      text: 'I made a demo with illustrative rankings.',
      replyToId: null,
      albumId: null,
    },
  ],
  clarifications: [],
  selectedPost: null,
  selectedCandidate: null,
  memories: [],
  pendingRequests: [],
}
const source = { kind: 'telegram' as const, messageId: 'm1' }
const proposal = (summary: string) => ({
  postEdit: {
    existingPostId: null,
    expectedVersion: null,
    title: 'Demo',
    summary,
    detail: 'A preview of an evaluation interface.',
    sources: [source],
  },
  resolutions: [],
  question: null,
  reason: 'Shared work.',
})
const issue = {
  field: 'summary',
  problem: 'Illustrative scores are presented as measured.',
  correction: 'Identify the scores as illustrative.',
}
const ports = (model: ModelPorts['model']): ModelPorts => ({
  model,
  progress: () => Effect.void,
  readTool: () => Effect.die('No lookup expected'),
})

it('passes verifier corrections to a new writer and only returns the accepted draft', async () => {
  const calls: string[] = []
  const host = ports((request) =>
    Effect.sync(() => {
      calls.push(request.task)
      if (request.task === 'evidence')
        return {
          subject: 'An evaluation interface demo',
          purpose: { claim: 'Preview agent evaluation rankings.', sources: [source] },
          facts: [{ claim: 'Scores are illustrative.', kind: 'status', sources: [source] }],
          links: [],
          uncertainties: [],
        }
      if (request.task === 'verification')
        return { issues: calls.filter((c) => c === 'verification').length === 1 ? [issue] : [] }
      const input = request.input as { corrections: unknown[]; previousDraft: unknown }
      if (calls.filter((c) => c === 'post').length === 1)
        return proposal('Measured model rankings.')
      expect(input.corrections).toEqual([issue])
      expect(input.previousDraft).toEqual(proposal('Measured model rankings.'))
      return proposal('Illustrative model rankings.')
    }),
  )
  const draft = await Effect.runPromise(reviewedPost(host, context))
  expect(draft.proposal.postEdit?.summary).toBe('Illustrative model rankings.')
  expect(calls).toEqual(['evidence', 'post', 'verification', 'post', 'verification'])
})

it('returns failure instead of a publishable draft after two rejections', async () => {
  let writes = 0
  const host = ports((request) =>
    Effect.sync(() => {
      if (request.task === 'evidence')
        return {
          subject: 'An evaluation interface demo',
          purpose: { claim: 'Preview agent evaluation rankings.', sources: [source] },
          facts: [],
          links: [],
          uncertainties: [],
        }
      if (request.task === 'verification') return { issues: [issue] }
      writes++
      return proposal('Measured model rankings.')
    }),
  )
  await expect(Effect.runPromise(reviewedPost(host, context))).rejects.toThrow(
    'rejected after repair',
  )
  expect(writes).toBe(2)
})

it('rejects invented fact citations before the writer runs', async () => {
  const calls: string[] = []
  const host = ports((request) =>
    Effect.sync(() => {
      calls.push(request.task)
      return {
        subject: 'An evaluation interface demo',
        purpose: { claim: 'Preview agent evaluation rankings.', sources: [source] },
        facts: [
          {
            claim: 'Real leaderboard.',
            kind: 'status',
            sources: [{ ...source, messageId: 'invented' }],
          },
        ],
        links: [],
        uncertainties: [],
      }
    }),
  )
  await expect(Effect.runPromise(reviewedPost(host, context))).rejects.toThrow('Rejected source')
  expect(calls).toEqual(['evidence'])
})

it('rejects a proposed new post when research cannot establish its end-user purpose', async () => {
  const unknown = {
    ...context,
    messages: [
      { ...context.messages[0], text: 'I built the frontend for a site called Nuconstruct.' },
    ],
  }
  const calls: string[] = []
  const host = ports((request) =>
    Effect.sync(() => {
      calls.push(request.task)
      if (request.task === 'evidence')
        return {
          subject: 'A website frontend',
          purpose: null,
          facts: [
            { claim: 'The owner built the frontend.', kind: 'owner_claim', sources: [source] },
          ],
          links: [],
          uncertainties: ['What the website lets its visitors do is unknown.'],
        }
      if (request.task === 'verification') return { issues: [] }
      return proposal('A website frontend built with AI.')
    }),
  )
  await expect(Effect.runPromise(reviewedPost(host, unknown))).rejects.toThrow(/purpose/i)
  expect(calls).toContain('post')
})
