import { Schema } from 'effect'
import type { Feed } from './post'

export const FeedSort = Schema.Literals(['latest', 'comments', 'bookmarks'])
export type FeedSort = typeof FeedSort.Type
export type FeedSearch = {
  sort: FeedSort
  q: string
  bookmarked?: true
  authors?: string[]
  groups?: string[]
}

function parseIds(value: unknown) {
  const values = Array.isArray(value) ? value : [value]
  return [
    ...new Set(
      values.filter(
        (id): id is string =>
          typeof id === 'string' && /^[\w-]{1,64}$/.test(id),
      ),
    ),
  ].slice(0, 50)
}

export function parseFeedSearch(search: Record<string, unknown>): FeedSearch {
  const authors = parseIds(search.authors)
  const groups = parseIds(search.groups)
  return {
    sort: Schema.is(FeedSort)(search.sort) ? search.sort : 'latest',
    q: typeof search.q === 'string' ? search.q.slice(0, 200) : '',
    ...(search.bookmarked === true ? { bookmarked: true as const } : {}),
    ...(authors.length ? { authors } : {}),
    ...(groups.length ? { groups } : {}),
  }
}

export function selectFilterOptions(
  data: Feed,
  search: FeedSearch,
  user: string | null,
) {
  const authors = search.authors?.map((id) => (id === 'me' ? user : id))
  const groupIds = new Set<string>()
  const authorIds = new Set<string>()
  for (const post of data.posts) {
    if (!authors?.length || authors.includes(post.author))
      groupIds.add(post.group)
    if (!search.groups?.length || search.groups.includes(post.group))
      authorIds.add(post.author)
  }
  return {
    groups: [...groupIds]
      .filter((id) => data.groups[id])
      .sort((a, b) => data.groups[a].name.localeCompare(data.groups[b].name)),
    authors: [
      ...(!search.groups?.length || (user && authorIds.has(user))
        ? ['me']
        : []),
      ...[...authorIds]
        .filter((id) => id !== user && data.people[id])
        .sort((a, b) => data.people[a].name.localeCompare(data.people[b].name)),
    ],
  }
}

export function selectPosts(
  data: Feed,
  search: FeedSearch,
  saved: readonly string[],
  user: string | null = null,
) {
  const q = search.q.trim().toLocaleLowerCase()
  const authors = search.authors?.map((id) => (id === 'me' ? user : id))
  return data.posts
    .filter(
      (post) =>
        (!search.bookmarked || saved.includes(post.id)) &&
        (!authors?.length || authors.includes(post.author)) &&
        (!search.groups?.length || search.groups.includes(post.group)) &&
        [
          post.title,
          post.summary,
          post.project,
          data.people[post.author]?.name ?? '',
        ]
          .join(' ')
          .toLocaleLowerCase()
          .includes(q),
    )
    .sort((a, b) => {
      const popularity =
        search.sort === 'comments'
          ? b.comments.length - a.comments.length
          : search.sort === 'bookmarks'
            ? b.bookmarks +
              Number(saved.includes(b.id)) -
              (a.bookmarks + Number(saved.includes(a.id)))
            : 0
      return (
        popularity ||
        b.publishedAt.localeCompare(a.publishedAt) ||
        a.id.localeCompare(b.id)
      )
    })
}
