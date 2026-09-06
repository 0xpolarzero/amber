import { Schema } from 'effect'
import type { Feed } from './post'

export const FeedSort = Schema.Literals(['latest', 'comments', 'bookmarks'])
export type FeedSort = typeof FeedSort.Type
export type FeedSearch = {
  sort: FeedSort
  q: string
  bookmarked?: true
  authors?: string[]
}

export function parseFeedSearch(search: Record<string, unknown>): FeedSearch {
  const rawAuthors = Array.isArray(search.authors)
    ? search.authors
    : [search.authors]
  const authors = [
    ...new Set(
      rawAuthors.filter(
        (author): author is string =>
          typeof author === 'string' && /^[\w-]{1,64}$/.test(author),
      ),
    ),
  ].slice(0, 50)
  return {
    sort: Schema.is(FeedSort)(search.sort) ? search.sort : 'latest',
    q: typeof search.q === 'string' ? search.q.slice(0, 200) : '',
    ...(search.bookmarked === true ? { bookmarked: true as const } : {}),
    ...(authors.length ? { authors } : {}),
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
