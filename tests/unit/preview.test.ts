import { describe, expect, it } from 'vitest'
import { createPreviewState, previewReducer } from '../../src/preview/state'
import fixtures from '../../src/server/fixtures.json'

const initial = () => createPreviewState(fixtures)
const author = () => previewReducer(initial(), { type: 'role', role: 'author' })

describe('sample interactions', () => {
  it('only lets the recipient read a private question, retaining read state across account switches', () => {
    const visitor = initial()
    const action = { type: 'readQuestion', postId: 'voice-notes' } as const
    expect(previewReducer(visitor, action)).toBe(visitor)
    const member = previewReducer(visitor, { type: 'role', role: 'member' })
    expect(previewReducer(member, action)).toBe(member)
    const read = previewReducer(author(), action)
    expect(read.readQuestionsByUser.alex).toEqual(['voice-notes'])
    expect(previewReducer(read, action)).toBe(read)
    const switched = previewReducer(read, { type: 'role', role: 'member' })
    expect(switched.readQuestionsByUser.you ?? []).toEqual([])
    expect(
      previewReducer(switched, { type: 'role', role: 'author' })
        .readQuestionsByUser.alex,
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
  it('does not overwrite a post edited after an answer was drafted', () => {
    const state = author()
    const baseDetail = state.posts[0].detail
    const edited = previewReducer(state, {
      type: 'edit',
      postId: 'voice-notes',
      title: 'A new title',
      summary: 'A new summary',
      detail: 'New details',
    })
    expect(
      previewReducer(edited, {
        type: 'answer',
        postId: 'voice-notes',
        baseDetail,
        text: 'Available now.',
      }),
    ).toBe(edited)
    const accepted = previewReducer(state, {
      type: 'answer',
      postId: 'voice-notes',
      baseDetail,
      text: 'Available now.',
    })
    expect(accepted.posts[0].detail).toContain('Available now.')
    expect(accepted.posts[0].question).toBeUndefined()
  })
  it('keeps a private draft across navigation and account changes', () => {
    const state = author()
    const action = {
      type: 'draftAnswer',
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
  it('retains the question and accepted reply, clears the draft, and rejects duplicate publication', () => {
    const state = previewReducer(author(), {
      type: 'draftAnswer',
      postId: 'voice-notes',
      text: '  Available now.  ',
    })
    const action = {
      type: 'answer',
      postId: 'voice-notes',
      baseDetail: state.posts[0].detail,
      text: '  Available now.  ',
    } as const
    const accepted = previewReducer(state, action)
    expect(accepted.conversations['voice-notes']).toEqual({
      question: state.posts[0].question,
      answer: 'Available now.',
      draft: '',
    })
    expect(accepted.posts[0].question).toBeUndefined()
    expect(previewReducer(accepted, action)).toBe(accepted)
    expect(
      previewReducer(accepted, {
        type: 'draftAnswer',
        postId: 'voice-notes',
        text: 'Another reply',
      }),
    ).toBe(accepted)
  })
})
