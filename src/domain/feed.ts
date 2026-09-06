import { Schema } from 'effect'
import type { Feed } from './post'

export const FeedSort = Schema.Literals(['latest', 'comments', 'bookmarks'])
export type FeedSort = typeof FeedSort.Type
export type FeedSearch = { sort: FeedSort; q: string }

export function parseFeedSearch(search: Record<string, unknown>): FeedSearch {
  return {
    sort: Schema.is(FeedSort)(search.sort) ? search.sort : 'latest',
    q: typeof search.q === 'string' ? search.q.slice(0, 200) : '',
  }
}

export function selectPosts(
  data: Feed,
  search: FeedSearch,
  saved: readonly string[],
  onlySaved = false,
) {
  const q = search.q.trim().toLocaleLowerCase()
  return data.posts
    .filter(
      (post) =>
        (!onlySaved || saved.includes(post.id)) &&
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
