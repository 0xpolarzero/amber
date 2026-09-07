import { describe, expect, it } from 'vitest'
import {
  parseFeedSearch,
  selectFilterOptions,
  selectPosts,
} from '../../src/domain/feed'
import fixtures from '../../src/server/fixtures.json'

const data = {
  ...fixtures,
  groups: {
    builders: { name: 'AI Builders' },
    creative: { name: 'Creative AI' },
  },
  posts: fixtures.posts.map((post) => ({
    ...post,
    group: ['reading-margin', 'palette-tool'].includes(post.id)
      ? 'creative'
      : 'builders',
  })),
}

describe('group and author filters', () => {
  it('intersects groups with authors, bookmarks and search while keeping alternatives within each filter', () => {
    expect(
      selectPosts(
        data,
        {
          sort: 'latest',
          q: '',
          groups: ['builders'],
          authors: ['alex', 'maya'],
        },
        [],
      ).map((post) => post.id),
    ).toEqual(['voice-notes'])
    expect(
      selectPosts(
        data,
        {
          sort: 'latest',
          q: 'margin',
          groups: ['builders', 'creative'],
          authors: ['alex', 'maya'],
          bookmarked: true,
        },
        ['reading-margin'],
      ).map((post) => post.id),
    ).toEqual(['reading-margin'])
    expect(
      selectPosts(data, { sort: 'latest', q: '', groups: ['missing'] }, []),
    ).toEqual([])
  })
  it('limits authors by selected groups and groups by selected authors without hiding alternatives in the same filter', () => {
    const all = selectFilterOptions(data, parseFeedSearch({}), null)
    expect(new Set(all.authors)).toEqual(
      new Set(['me', 'alex', 'maya', 'julien', 'nina', 'sam']),
    )
    const fromGroup = selectFilterOptions(
      data,
      parseFeedSearch({ groups: ['builders'] }),
      null,
    )
    expect(new Set(fromGroup.authors)).toEqual(
      new Set(['alex', 'julien', 'sam']),
    )
    expect(new Set(fromGroup.groups)).toEqual(new Set(['builders', 'creative']))
    const fromAuthor = selectFilterOptions(
      data,
      parseFeedSearch({ authors: ['maya'] }),
      null,
    )
    expect(fromAuthor.groups).toEqual(['creative'])
    const both = selectFilterOptions(
      data,
      parseFeedSearch({ groups: ['creative'], authors: ['maya'] }),
      null,
    )
    expect(new Set(both.authors)).toEqual(new Set(['maya', 'nina']))
    expect(both.groups).toEqual(['creative'])
    expect(
      new Set(
        selectFilterOptions(
          data,
          parseFeedSearch({ authors: ['maya', 'alex'] }),
          null,
        ).groups,
      ),
    ).toEqual(new Set(['builders', 'creative']))
  })
  it('resolves Me by account and only offers it in groups where that account has posts', () => {
    expect(
      selectFilterOptions(
        data,
        parseFeedSearch({ groups: ['builders'] }),
        'alex',
      ).authors,
    ).toContain('me')
    expect(
      selectFilterOptions(
        data,
        parseFeedSearch({ groups: ['builders'] }),
        'alex',
      ).authors,
    ).not.toContain('alex')
    expect(
      selectFilterOptions(
        data,
        parseFeedSearch({ groups: ['creative'] }),
        'alex',
      ).authors,
    ).not.toContain('me')
    expect(
      selectFilterOptions(data, parseFeedSearch({ authors: ['me'] }), 'alex')
        .groups,
    ).toEqual(['builders'])
    expect(
      selectFilterOptions(data, parseFeedSearch({ authors: ['me'] }), 'you')
        .groups,
    ).toEqual([])
    expect(
      selectFilterOptions(data, parseFeedSearch({ authors: ['me'] }), null)
        .groups,
    ).toEqual([])
  })
  it('normalizes group URL values and keeps incompatible selections explicit', () => {
    expect(
      parseFeedSearch({ groups: ['builders', 'builders', null, '', {}] }),
    ).toEqual({ sort: 'latest', q: '', groups: ['builders'] })
    const search = parseFeedSearch({ groups: 'creative', authors: ['alex'] })
    expect(search.groups).toEqual(['creative'])
    expect(selectPosts(data, search, [])).toEqual([])
    expect(selectFilterOptions(data, search, null).groups).toEqual(['builders'])
    expect(new Set(selectFilterOptions(data, search, null).authors)).toEqual(
      new Set(['maya', 'nina']),
    )
  })
})
