import { describe, expect, it } from 'vitest'
import { parseFeedSearch, selectPosts } from '../../src/domain/feed'
import fixtures from '../../src/server/fixtures.json'

describe('feed discovery', () => {
  it('combines any selected author with bookmarks and text search', () => {
    expect(
      selectPosts(
        fixtures,
        {
          sort: 'latest',
          q: '',
          authors: ['alex', 'maya'],
        },
        [],
      ).map((post) => post.id),
    ).toEqual(['voice-notes', 'reading-margin', 'tab-tidy'])
    expect(
      selectPosts(
        fixtures,
        {
          sort: 'latest',
          q: 'margin',
          authors: ['alex', 'maya'],
          bookmarked: true,
        },
        ['reading-margin', 'palette-tool'],
      ).map((post) => post.id),
    ).toEqual(['reading-margin'])
  })
  it('resolves Me against the connected account and never matches a visitor', () => {
    const search = parseFeedSearch({ authors: ['me'] })
    expect(
      selectPosts(fixtures, search, [], 'alex').map((post) => post.id),
    ).toEqual(['voice-notes', 'tab-tidy'])
    expect(selectPosts(fixtures, search, [], 'you')).toEqual([])
    expect(selectPosts(fixtures, search, [], null)).toEqual([])
  })
  it('normalizes URL filters and ignores malformed entries', () => {
    expect(
      parseFeedSearch({
        authors: ['maya', null, 'maya', '', {}, 'me'],
        bookmarked: true,
      }),
    ).toEqual({
      sort: 'latest',
      q: '',
      authors: ['maya', 'me'],
      bookmarked: true,
    })
    expect(parseFeedSearch({ authors: {}, bookmarked: 'false' })).toEqual({
      sort: 'latest',
      q: '',
    })
  })
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
      'tab-tidy',
    ])
  })
  it('matches author and project names case-insensitively, including bookmarks', () => {
    expect(
      selectPosts(fixtures, { sort: 'latest', q: ' MAYA ' }, []).map(
        (p) => p.id,
      ),
    ).toEqual(['reading-margin'])
    expect(
      selectPosts(fixtures, { sort: 'latest', q: 'noted', bookmarked: true }, [
        'voice-notes',
      ]).map((p) => p.id),
    ).toEqual(['voice-notes'])
    expect(
      selectPosts(
        fixtures,
        { sort: 'latest', q: 'noted', bookmarked: true },
        [],
      ),
    ).toEqual([])
  })
})
