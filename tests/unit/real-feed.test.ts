import { describe, expect, it } from 'vitest'
import { createPreviewState, previewReducer } from '../../src/preview/state'
import { projectRealFeed } from '../../src/server/real-feed'

const snapshot = {
  importedAt: '2026-09-14T12:00:00Z',
  groupId: 'group',
  groupName: 'Builders',
  authors: {
    owner: { name: 'Real Owner' },
    bystander: { name: 'Other Member' },
  },
  messages: [
    {
      id: 'm1',
      authorId: 'owner',
      text: 'I built the project.',
      date: '2026-09-13T12:00:00Z',
      sourceUrl: 'https://t.me/c/1/1',
    },
  ],
}
const run = {
  snapshotHash: 'same',
  completedMessages: 1,
  state: {
    posts: [
      {
        id: 'p1',
        authorId: 'owner',
        title: 'Project',
        summary: 'A useful project.',
        detail: 'Details.',
      },
    ],
    pendingRequests: [{ id: 'q1', addressed: false }],
    sources: { p1: [{ kind: 'telegram', messageId: 'm1' }] },
  },
  batches: [
    {
      status: 'completed',
      input: { messages: snapshot.messages },
      calls: [
        {
          task: 'post',
          input: { work: { ownerId: 'owner' } },
          observations: [],
          status: 'succeeded',
          output: { question: 'Where is the demo?' },
        },
      ],
      result: {
        questions: [
          {
            id: 'q1',
            authorId: 'owner',
            postId: 'p1',
            text: 'Where is the demo?',
            needsReply: true,
          },
        ],
        notifications: [],
      },
    },
  ],
}

describe('real Telegram preview', () => {
  it('uses actual owners, sources and captured questions without fixture engagement or conversations', () => {
    const feed = projectRealFeed(snapshot, run)
    expect(feed.posts[0]).toMatchObject({
      author: 'owner',
      publishedAt: snapshot.messages[0].date,
      sourceUrl: snapshot.messages[0].sourceUrl,
      bookmarks: 0,
      comments: [],
    })
    expect(Object.keys(feed.realDemo?.conversations ?? {})).toEqual(['owner'])
    const state = createPreviewState(feed)
    expect(state.selectedRealAuthor).toBe('owner')
    expect(state.agentByUser.owner.messages[0]).toMatchObject({
      text: 'Where is the demo?',
      needsReply: true,
    })
    expect(state.agentByUser.alex).toBeUndefined()
    expect(
      previewReducer(state, { type: 'sendMessage', id: 'fake', text: 'hello' }),
    ).toBe(state)
    expect(previewReducer(state, { type: 'loadScenario', id: 'replay' })).toBe(
      state,
    )
  })

  it('shows factual stage summaries and preserves failed attempts and raw evidence', () => {
    const calls = [
      {
        task: 'selection',
        input: {},
        output: { candidates: [{}], ignored: [] },
        observations: [],
        status: 'succeeded',
      },
      {
        ...run.batches[0].calls[0],
        status: 'failed',
        error: 'Provider timed out',
      },
      { ...run.batches[0].calls[0], input: { work: { ownerId: 'bystander' } } },
      {
        ...run.batches[0].calls[0],
        input: {
          work: { ownerId: 'owner' },
          selectedPost: { id: 'another-post' },
        },
      },
      run.batches[0].calls[0],
    ]
    const feed = projectRealFeed(snapshot, {
      ...run,
      batches: [{ ...run.batches[0], calls }],
    })
    const stages =
      feed.realDemo?.conversations.owner.messages[0].recordedTrace?.stages
    expect(stages?.map(({ label, status }) => ({ label, status }))).toEqual([
      { label: 'Read Telegram messages', status: 'complete' },
      { label: 'Select projects', status: 'complete' },
      { label: 'Prepare post and follow-up', status: 'failed' },
      { label: 'Prepare post and follow-up', status: 'complete' },
    ])
    expect(stages?.[1].summary).toBe('1 selected project · 0 ignored messages')
    expect(JSON.parse(stages?.[2].detail ?? '{}')).toMatchObject({
      input: { work: { ownerId: 'owner' } },
      tools: [],
      error: 'Provider timed out',
    })
    expect(feed.realDemo?.importComplete).toBe(true)
    expect(
      projectRealFeed(snapshot, { ...run, completedMessages: 0 }).realDemo
        ?.importComplete,
    ).toBe(false)
  })

  it('blocks replies while a batch runs or import counts disagree', () => {
    expect(
      projectRealFeed(snapshot, {
        ...run,
        batches: [{ ...run.batches[0], status: 'running' }],
      }).realDemo?.importComplete,
    ).toBe(false)
    expect(
      projectRealFeed(snapshot, { ...run, completedMessages: 2 }).realDemo
        ?.importComplete,
    ).toBe(false)
  })

  it('does not publish outputs of a failed batch', () => {
    const feed = projectRealFeed(snapshot, {
      ...run,
      batches: [{ ...run.batches[0], status: 'failed' }],
    })
    expect(feed.realDemo?.conversations.owner.messages).toEqual([])
  })

  it.each([false, true])(
    'projects committed diffs only when a receipt exists (%s)',
    (hasReceipt) => {
      const feed = projectRealFeed(snapshot, run, {
        snapshotHash: 'same',
        state: {
          posts: [
            { ...run.state.posts[0], detail: 'Updated by the real reply.' },
          ],
          memories: [
            {
              id: 'memory',
              userId: 'owner',
              text: 'Use short descriptions.',
              version: 1,
            },
          ],
          messages: [
            {
              id: 'reply',
              userId: 'owner',
              text: 'Updated.',
              role: 'assistant',
              intent: 'informational',
              linkedPostId: 'p1',
              addressed: false,
              turnId: 'turn',
            },
          ],
        },
        turns: [
          {
            input: { turnId: 'turn' },
            ...(hasReceipt
              ? {
                  receipt: {
                    diffs: [
                      {
                        postId: 'p1',
                        before: {
                          title: 'Project',
                          summary: 'A useful project.',
                          detail: 'Details.',
                          version: 1,
                        },
                        after: {
                          title: 'Project',
                          summary: 'A useful project.',
                          detail: 'Updated by the real reply.',
                          version: 2,
                        },
                      },
                    ],
                  },
                }
              : {}),
            calls: [
              {
                task: 'respond',
                input: {},
                output: {
                  answer: 'Updated.',
                  postChanges: [
                    { postId: 'p1', detail: 'Uncommitted model proposal.' },
                  ],
                },
                observations: [],
                status: 'succeeded',
              },
            ],
          },
        ],
      })
      expect(feed.posts[0].detail).toBe('Updated by the real reply.')
      expect(feed.realDemo?.conversations.owner.memories[0].text).toBe(
        'Use short descriptions.',
      )
      expect(
        feed.realDemo?.conversations.owner.messages[0].recordedTrace?.stages[0]
          .label,
      ).toBe('Prepare reply')
      const committed =
        feed.realDemo?.conversations.owner.messages[0].recordedTrace?.stages.find(
          ({ label }) => label === 'Update posts',
        )
      if (hasReceipt) {
        expect(committed).toMatchObject({
          status: 'complete',
          summary: '1 post updated',
          changes: [
            {
              postId: 'p1',
              kind: 'updated',
              project: 'Project',
              fromVersion: 1,
              toVersion: 2,
              fields: [
                {
                  field: 'detail',
                  before: 'Details.',
                  after: 'Updated by the real reply.',
                },
              ],
            },
          ],
        })
      } else expect(committed).toBeUndefined()
    },
  )
})
