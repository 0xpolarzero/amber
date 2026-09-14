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
                messages: snapshot.messages,
                work: {
                  ownerId: 'owner',
                  candidateId: 'work',
                  candidate: { messageIds: ['m1'] },
                },
                selectedPost: update ? before : null,
                selectedCandidate: update ? null : { id: 'p1' },
              },
              output: {
                postEdit: { ...post, existingPostId: update ? 'p1' : null },
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
    expect(sourceItems).toHaveLength(1)
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
