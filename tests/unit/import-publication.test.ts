import { expect, it } from 'vitest'
import { postLinks } from '../../src/server/post-links'
import { projectRealFeed } from '../../src/server/real-feed'

const before = {
  id: 'p1',
  authorId: 'owner',
  title: 'Noted',
  summary: 'Offline notes.',
  detail: 'Mac only.',
  version: 1,
}
const after = { ...before, detail: 'Mac and Linux.', version: 2 }
const snapshot = {
  importedAt: '2026-09-14',
  groupId: 'group',
  groupName: 'Builders',
  authors: { owner: { name: 'Owner' } },
  messages: [
    {
      id: 'm1',
      authorId: 'owner',
      text: 'I built https://noted.example/app.',
      date: '2026-09-14',
      sourceUrl: 'https://t.me/c/1/1',
    },
    {
      id: 'noise',
      authorId: 'owner',
      text: 'Unrelated chatter.',
      date: '2026-09-14',
      sourceUrl: 'https://t.me/c/1/2',
    },
  ],
}

it.each([false, true])(
  'shows the committed creation or update from an old notification capture (update=%s)',
  (update) => {
    const notification = {
      id: 'work@0:notification',
      authorId: 'owner',
      text: '1 post edited',
    }
    const post = update ? after : before
    const run = {
      snapshotHash: 'same',
      completedMessages: 1,
      state: {
        posts: [post],
        pendingRequests: [],
        sources: { p1: [{ kind: 'telegram', messageId: 'm1' }] },
      },
      batches: [
        {
          status: 'completed',
          input: { messages: snapshot.messages },
          calls: [
            {
              task: 'post',
              status: 'succeeded',
              observations: [
                {
                  kind: 'tool',
                  name: 'readMessages',
                  input: { messageIds: ['m1'] },
                  output: snapshot.messages,
                },
              ],
              input: {
                messages: [
                  ...snapshot.messages,
                  { id: 'noise', text: 'Unrelated chatter.' },
                ],
                work: {
                  ownerId: 'owner',
                  candidateId: 'work',
                  candidate: { messageIds: ['m1', 'noise'] },
                },
                selectedPost: update ? before : null,
                selectedCandidate: update ? null : { id: 'p1' },
              },
              output: {
                postEdit: {
                  ...post,
                  existingPostId: update ? 'p1' : null,
                  sources: [{ kind: 'telegram', messageId: 'm1' }],
                },
              },
            },
          ],
          result: {
            posts: [post],
            diffs: update ? [{ postId: 'p1', before, after }] : [],
            questions: [],
            notifications: [notification],
          },
        },
      ],
    }
    // A repaired run must use the final writer's citations, not the rejected first draft.
    const writer = run.batches[0].calls[0]
    run.batches[0].calls.unshift({
      ...writer,
      output: {
        postEdit: {
          ...writer.output.postEdit,
          sources: [{ kind: 'telegram', messageId: 'noise' }],
        },
      },
    })
    // Saved messaging previously discarded imported notification text and post references.
    const feed = projectRealFeed(snapshot, run, {
      snapshotHash: 'same',
      state: {
        posts: [post],
        memories: [],
        messages: [
          {
            id: notification.id,
            userId: 'owner',
            text: '1 post edited',
            role: 'assistant',
            intent: 'informational',
            addressed: true,
            linkedPostId: null,
            turnId: null,
          },
        ],
      },
      turns: [],
    })
    const message = feed.realDemo?.conversations.owner.messages[0]
    expect(message?.postId).toBe('p1')
    const sourceItems = message?.recordedTrace?.stages[0].sections?.[0].items
    expect(sourceItems?.map((item) => item.id)).toEqual(['m1'])
    expect(
      message?.recordedTrace?.stages
        .flatMap((stage) => stage.sections ?? [])
        .some((section) => section.title === 'Proposed post'),
    ).toBe(false)
    const writerSections = message?.recordedTrace?.stages.find(
      (stage) => stage.label === 'Prepare post and follow-up',
    )?.sections
    expect(
      writerSections?.some((section) => section.title === 'Telegram messages'),
    ).toBe(false)
    expect(
      writerSections?.find((section) =>
        section.title.startsWith('readMessages'),
      )?.items[0].text,
    ).toBe('Message m1 · see Telegram messages')

    expect(message?.text).toBe(`${update ? 'Updated' : 'Created'} “Noted”.`)
    const changes = message?.recordedTrace?.stages.flatMap(
      (stage) => stage.changes ?? [],
    )
    expect(changes).toHaveLength(1)
    expect(changes?.[0].kind).toBe(update ? 'updated' : 'created')
    expect(
      changes?.[0].fields.find(({ field }) => field === 'detail'),
    ).toMatchObject({
      before: update ? 'Mac only.' : '',
      after: post.detail,
    })
    expect(feed.posts[0].projectUrl).toBe('https://noted.example/app')
    expect(
      message?.recordedTrace?.stages[0].sections?.[0].items[0].text,
    ).toContain('https://noted.example')
  },
)

it('keeps cited links, deduplicates them and rejects credential-bearing or non-web URLs', () => {
  expect(
    postLinks(
      ['Try https://noted.example/.', 'Again https://noted.example/'],
      [
        'https://noted.example/',
        'javascript:alert(1)',
        'https://user:secret@private.example/',
        'https://t.me/group/1',
      ],
    ),
  ).toEqual(['https://noted.example/'])
})

it('preserves every cited Telegram message instead of choosing only the first', () => {
  const messages = [
    'An introductory remark.',
    'I built a benchmark repo.',
    'It isolates each agent.',
  ].map((text, index) => ({
    ...snapshot.messages[0],
    id: `source-${index}`,
    text,
    sourceUrl: `https://t.me/c/1/${index + 1}`,
  }))
  const feed = projectRealFeed(
    { ...snapshot, messages },
    {
      snapshotHash: 'sources',
      completedMessages: 3,
      state: {
        posts: [before],
        pendingRequests: [],
        sources: {
          p1: messages.map(({ id }) => ({ kind: 'telegram', messageId: id })),
        },
      },
      batches: [],
    },
  )
  expect(feed.posts[0].telegramSources).toEqual(
    messages.map(({ id, text, sourceUrl }) => ({ id, text, url: sourceUrl })),
  )
})

it('hides a raw GitHub duplicate only when the same file has a cited readable link', () => {
  const raw = 'https://raw.githubusercontent.com/owner/repo/main/src/example.ts'
  const readable = 'https://github.com/owner/repo/blob/main/src/example.ts'
  expect(postLinks([readable], [raw])).toEqual([readable])
  expect(postLinks([], [raw])).toEqual([raw])
})
