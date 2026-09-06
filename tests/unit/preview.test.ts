import { describe, expect, it } from 'vitest'
import { createPreviewState, previewReducer } from '../../src/preview/state'
import fixtures from '../../src/server/fixtures.json'

const initial = () => createPreviewState(fixtures)
const author = () => previewReducer(initial(), { type: 'role', role: 'author' })

describe('sample interactions', () => {
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
})
