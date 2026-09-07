import { describe, expect, it } from 'vitest'
import { createPreviewState, previewReducer } from '../../src/preview/state'
import fixtures from '../../src/server/fixtures.json'

const initial = () => createPreviewState(fixtures)
const author = () => previewReducer(initial(), { type: 'role', role: 'author' })

describe('sample interactions', () => {
  it('keeps one agent conversation and read position per account', () => {
    const state = author()
    const read = previewReducer(state, { type: 'readAgent' })
    expect(read.agentByUser.alex.readThrough).toBe(
      read.agentByUser.alex.messages.length,
    )
    expect(previewReducer(read, { type: 'readAgent' })).toBe(read)
    const member = previewReducer(read, { type: 'role', role: 'member' })
    expect(member.agentByUser.you.messages).toEqual([])
    expect(member.agentByUser.alex.readThrough).toBe(
      read.agentByUser.alex.readThrough,
    )
    expect(previewReducer(initial(), { type: 'readAgent' }).role).toBe(
      'visitor',
    )
  })
  it('rejects visitor writes and edits to someone else’s post', () => {
    const state = initial()
    expect(previewReducer(state, { type: 'save', postId: 'voice-notes' })).toBe(
      state,
    )
    const member = previewReducer(state, { type: 'role', role: 'member' })
    expect(
      previewReducer(member, { type: 'remove', postId: 'voice-notes' }),
    ).toBe(member)
    expect(
      previewReducer(member, {
        type: 'edit',
        postId: 'voice-notes',
        title: 'Changed',
        summary: 'Changed',
        detail: '',
      }),
    ).toBe(member)
  })
  it('keeps saved posts separate for each sample account', () => {
    const saved = previewReducer(author(), {
      type: 'save',
      postId: 'voice-notes',
    })
    const member = previewReducer(saved, { type: 'role', role: 'member' })
    expect(member.savedByUser.alex).toEqual(['voice-notes'])
    expect(member.savedByUser.you ?? []).toEqual([])
  })
  it('trims comments, rejects blanks, and only deletes your own comments', () => {
    const state = author()
    expect(
      previewReducer(state, {
        type: 'comment',
        postId: 'voice-notes',
        id: 'new',
        text: '   ',
      }),
    ).toBe(state)
    const commented = previewReducer(state, {
      type: 'comment',
      postId: 'voice-notes',
      id: 'new',
      text: '  Ready to try.  ',
    })
    expect(commented.posts[0].comments.at(-1)?.text).toBe('Ready to try.')
    expect(
      previewReducer(commented, {
        type: 'deleteComment',
        postId: 'voice-notes',
        commentId: '1',
      }),
    ).toBe(commented)
    expect(
      previewReducer(commented, {
        type: 'deleteComment',
        postId: 'voice-notes',
        commentId: 'new',
      }).posts[0].comments,
    ).toHaveLength(3)
  })
  it('shares a draft across posts but never across accounts', () => {
    const state = author()
    const drafted = previewReducer(state, {
      type: 'draftMessage',
      text: 'Keep descriptions short.',
    })
    expect(drafted.agentByUser.alex.draft).toBe('Keep descriptions short.')
    expect(drafted.posts).toBe(state.posts)
    const member = previewReducer(drafted, { type: 'role', role: 'member' })
    const memberDraft = previewReducer(member, {
      type: 'draftMessage',
      text: 'My own draft.',
    })
    expect(memberDraft.agentByUser.you.draft).toBe('My own draft.')
    expect(memberDraft.agentByUser.alex.draft).toBe('Keep descriptions short.')
    expect(
      previewReducer(drafted, { type: 'draftMessage', text: 'x'.repeat(1001) }),
    ).toBe(drafted)
  })
  it('keeps discussion about different posts in the same history', () => {
    const state = author()
    const sent = previewReducer(state, {
      type: 'sendMessage',
      postId: 'voice-notes',
      id: 'first',
      text: '  Thanks!  ',
    })
    const next = previewReducer(sent, {
      type: 'sendMessage',
      postId: 'tab-tidy',
      id: 'second',
      text: 'This one is free too.',
    })
    expect(
      next.agentByUser.alex.messages.slice(-2).map((message) => message.postId),
    ).toEqual(['voice-notes', 'tab-tidy'])
    expect(next.agentByUser.alex.messages.at(-2)?.text).toBe('Thanks!')
    expect(next.posts).toBe(state.posts)
    expect(
      previewReducer(next, {
        type: 'sendMessage',
        id: 'second',
        text: 'Replay',
      }),
    ).toBe(next)
    expect(
      previewReducer(next, { type: 'sendMessage', id: 'blank', text: '   ' }),
    ).toBe(next)
  })
  it('records a preference once and reuses it on two applied post updates', () => {
    const state = initial()
    const agent = state.agentByUser.alex
    expect(agent.memories).toHaveLength(1)
    const updates = agent.messages.filter((message) => message.update)
    expect(updates.map((message) => message.postId)).toEqual([
      'voice-notes',
      'tab-tidy',
    ])
    for (const message of updates) {
      expect(message.usedMemories?.[0].id).toBe(agent.memories[0].id)
      expect(message.update?.before).toBe(
        fixtures.posts.find((post) => post.id === message.postId)?.summary,
      )
      expect(message.update?.after).toBe(
        state.posts.find((post) => post.id === message.postId)?.summary,
      )
    }
  })
  it('lets the user edit or forget memories without losing the conversation', () => {
    const state = author()
    const edited = previewReducer(state, {
      type: 'saveMemory',
      id: 'writing-style',
      text: 'Use one sentence.',
    })
    expect(edited.agentByUser.alex.memories[0].text).toBe('Use one sentence.')
    const forgotten = previewReducer(edited, {
      type: 'forgetMemory',
      id: 'writing-style',
    })
    expect(forgotten.agentByUser.alex.memories).toEqual([])
    expect(forgotten.agentByUser.alex.messages).toBe(
      state.agentByUser.alex.messages,
    )
    const member = previewReducer(state, { type: 'role', role: 'member' })
    expect(
      previewReducer(member, { type: 'forgetMemory', id: 'writing-style' }),
    ).toBe(member)
    const ownMemory = previewReducer(member, {
      type: 'saveMemory',
      id: 'writing-style',
      text: 'Use French.',
    })
    expect(ownMemory.agentByUser.you.memories[0].text).toBe('Use French.')
    expect(ownMemory.agentByUser.alex.memories).toBe(
      state.agentByUser.alex.memories,
    )
  })
  it('keeps memories and shared history when one post is removed', () => {
    const state = author()
    const removed = previewReducer(state, {
      type: 'remove',
      postId: 'voice-notes',
    })
    expect(removed.posts.some((post) => post.id === 'voice-notes')).toBe(false)
    expect(removed.agentByUser.alex).toBe(state.agentByUser.alex)
  })
  it('guards automatic updates against other owners, stale posts and forgotten memories', () => {
    const state = previewReducer(author(), {
      type: 'sendMessage',
      postId: 'voice-notes',
      id: 'correction',
      text: 'The demo is now on Windows.',
    })
    const action = {
      type: 'applyPostUpdate',
      postId: 'voice-notes',
      id: 'new-update',
      sourceMessageId: 'correction',
      text: 'Added Windows availability.',
      memoryIds: ['writing-style'],
      update: {
        field: 'summary',
        before: state.posts[0].summary,
        after: 'A voice note app with a free demo for Mac and Windows.',
      },
    } as const
    const updated = previewReducer(state, action)
    expect(updated.posts[0].summary).toBe(action.update.after)
    expect(
      updated.agentByUser.alex.messages.at(-1)?.usedMemories?.[0].text,
    ).toBe(state.agentByUser.alex.memories[0].text)
    expect(previewReducer(updated, action)).toBe(updated)
    const edited = previewReducer(state, {
      type: 'edit',
      postId: 'voice-notes',
      title: state.posts[0].title,
      summary: 'A newer summary.',
      detail: state.posts[0].detail,
    })
    expect(previewReducer(edited, action)).toBe(edited)
    const forgotten = previewReducer(state, {
      type: 'forgetMemory',
      id: 'writing-style',
    })
    expect(previewReducer(forgotten, action)).toBe(forgotten)
    const member = previewReducer(state, { type: 'role', role: 'member' })
    expect(previewReducer(member, action)).toBe(member)
  })
})
