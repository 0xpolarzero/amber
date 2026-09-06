import { describe, expect, it } from 'vitest'
import { parseFeedSearch, selectPosts } from '../../src/domain/feed'
import fixtures from '../../src/server/fixtures.json'

describe('feed discovery', () => {
  it('falls back from invalid URL sort values without throwing', () => {
    expect(parseFeedSearch({ sort: 'discussed', q: ['invalid'] })).toEqual({
      sort: 'latest',
      q: '',
    })
  })
  it('sorts comments and bookmarks independently of recency', () => {
    expect(selectPosts(fixtures, { sort: 'comments', q: '' }, [])[0].id).toBe(
      'voice-notes',
    )
    expect(selectPosts(fixtures, { sort: 'bookmarks', q: '' }, [])[0].id).toBe(
      'palette-tool',
    )
  })
  it('breaks popularity ties by publication date, not input order', () => {
    const data = { ...fixtures, posts: [...fixtures.posts].reverse() }
    expect(
      selectPosts(data, { sort: 'comments', q: '' }, []).map((p) => p.id),
    ).toEqual([
      'voice-notes',
      'reading-margin',
      'palette-tool',
      'meeting-tasks',
      'paper-map',
    ])
  })
  it('matches author and project names case-insensitively, including Saved', () => {
    expect(
      selectPosts(fixtures, { sort: 'latest', q: ' MAYA ' }, []).map(
        (p) => p.id,
      ),
    ).toEqual(['reading-margin'])
    expect(
      selectPosts(
        fixtures,
        { sort: 'latest', q: 'noted' },
        ['voice-notes'],
        true,
      ).map((p) => p.id),
    ).toEqual(['voice-notes'])
    expect(
      selectPosts(fixtures, { sort: 'latest', q: 'noted' }, [], true),
    ).toEqual([])
  })
})
