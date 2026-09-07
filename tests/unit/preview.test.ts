import { describe, expect, it } from 'vitest'
import { createPreviewState, previewReducer } from '../../src/preview/state'
import fixtures from '../../src/server/fixtures.json'

const initial = () => createPreviewState(fixtures)
const author = () => previewReducer(initial(), { type: 'role', role: 'author' })

describe('sample interactions', () => {
  it('only lets the recipient read a private question, retaining read state across account switches', () => {
    const visitor = initial()
    const action = { type: 'readConversation', postId: 'voice-notes' } as const
    expect(previewReducer(visitor, action)).toBe(visitor)
    const member = previewReducer(visitor, { type: 'role', role: 'member' })
    expect(previewReducer(member, action)).toBe(member)
    const read = previewReducer(author(), action)
    expect(read.readConversationsByUser.alex).toEqual(['voice-notes'])
    expect(previewReducer(read, action)).toBe(read)
    const switched = previewReducer(read, { type: 'role', role: 'member' })
    expect(switched.readConversationsByUser.you ?? []).toEqual([])
    expect(
      previewReducer(switched, { type: 'role', role: 'author' })
        .readConversationsByUser.alex,
    ).toEqual(['voice-notes'])
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
  it('keeps a private draft across navigation and account changes', () => {
    const state = author()
    const action = {
      type: 'draftMessage',
      postId: 'voice-notes',
      text: 'A demo is ready\nfor the group.',
    } as const
    const drafted = previewReducer(state, action)
    expect(drafted.conversations['voice-notes'].draft).toBe(action.text)
    expect(drafted.posts[0]).toBe(state.posts[0])
    const member = previewReducer(drafted, { type: 'role', role: 'member' })
    expect(previewReducer(member, { ...action, text: 'Not mine' })).toBe(member)
    const returned = previewReducer(member, { type: 'role', role: 'author' })
    expect(returned.conversations['voice-notes'].draft).toBe(action.text)
    expect(
      previewReducer(returned, { ...action, text: 'x'.repeat(1001) }),
    ).toBe(returned)
  })
  it('sends messages without editing the post, retains history, and keeps follow-ups available', () => {
    const state = previewReducer(author(), {
      type: 'draftMessage',
      postId: 'voice-notes',
      text: '  Thanks!  ',
    })
    const action = {
      type: 'sendMessage',
      postId: 'voice-notes',
      id: 'reply-1',
      text: '  Thanks!  ',
    } as const
    const sent = previewReducer(state, action)
    expect(sent.conversations['voice-notes'].messages.at(-1)).toEqual({
      id: 'reply-1',
      sender: 'author',
      text: 'Thanks!',
    })
    expect(sent.conversations['voice-notes'].draft).toBe('')
    expect(sent.posts[0]).toBe(state.posts[0])
    expect(previewReducer(sent, action)).toBe(sent)
    expect(previewReducer(sent, { ...action, id: 'blank', text: '  ' })).toBe(
      sent,
    )
    expect(
      previewReducer(sent, {
        type: 'draftMessage',
        postId: 'voice-notes',
        text: 'One more thing',
      }).conversations['voice-notes'].draft,
    ).toBe('One more thing')
    const member = previewReducer(sent, { type: 'role', role: 'member' })
    expect(previewReducer(member, { ...action, id: 'not-mine' })).toBe(member)
  })
  it('shows an already-applied example with an accurate before/after diff', () => {
    const state = initial()
    const conversation = state.conversations['voice-notes']
    expect(conversation.messages.map((message) => message.sender)).toEqual([
      'amber',
      'author',
      'amber',
    ])
    const update = conversation.messages.at(-1)?.update
    expect(update?.before).toBe(fixtures.posts[0].summary)
    expect(update?.after).toBe(state.posts[0].summary)
    expect(update?.after).toContain('free demo')
    expect(state.posts[0].question).toBeUndefined()
  })
  it('applies bot updates directly but rejects stale changes and duplicate responses', () => {
    const state = previewReducer(author(), {
      type: 'sendMessage',
      postId: 'voice-notes',
      id: 'correction',
      text: 'The demo is now available on Windows.',
    })
    const action = {
      type: 'applyPostUpdate',
      postId: 'voice-notes',
      id: 'update-2',
      sourceMessageId: 'correction',
      text: 'Added Windows availability.',
      update: {
        field: 'summary',
        before: state.posts[0].summary,
        after: 'A voice note app with a free demo for Mac and Windows.',
      },
    } as const
    const updated = previewReducer(state, action)
    expect(updated.posts[0].summary).toBe(action.update.after)
    expect(
      updated.conversations['voice-notes'].messages.at(-1)?.update,
    ).toEqual(action.update)
    expect(previewReducer(updated, action)).toBe(updated)
    expect(
      previewReducer(updated, {
        ...action,
        id: 'replay',
        update: {
          ...action.update,
          before: action.update.after,
          after: 'Duplicate update',
        },
      }),
    ).toBe(updated)
    const edited = previewReducer(state, {
      type: 'edit',
      postId: 'voice-notes',
      title: state.posts[0].title,
      summary: 'Author’s newer summary.',
      detail: state.posts[0].detail,
    })
    expect(previewReducer(edited, action)).toBe(edited)
    expect(
      previewReducer(state, {
        ...action,
        update: { ...action.update, after: '' },
      }),
    ).toBe(state)
    const member = previewReducer(state, { type: 'role', role: 'member' })
    expect(previewReducer(member, action)).toBe(member)
  })
})
