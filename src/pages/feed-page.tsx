import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { EmptyState } from '../components/empty-state'
import { FeedFilters } from '../components/feed-filters'
import { Icon } from '../components/icon'
import { PostCard } from '../components/post-card'
import { type FeedSearch, parseFeedSearch, selectPosts } from '../domain/feed'
import { usePreview } from '../preview/provider'

export function FeedPage({ search }: { search: FeedSearch }) {
  const { state, saved, user, openDialog } = usePreview()
  const navigate = useNavigate()
  const input = useRef<HTMLInputElement>(null)
  const update = (next: FeedSearch) =>
    void navigate({
      to: '/',
      search: parseFeedSearch(next),
      replace: true,
      resetScroll: false,
    })
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      const target = event.target
      if (
        event.key !== '/' ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        document.querySelector('dialog[open]') ||
        (target instanceof HTMLElement &&
          (target.matches('input,textarea,select') || target.isContentEditable))
      )
        return
      event.preventDefault()
      input.current?.focus()
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])
  const posts = selectPosts(state, search, saved, user)
  const needsAccount =
    !user && (search.bookmarked || search.authors?.includes('me'))
  const narrowed = Boolean(
    search.q || search.authors?.length || search.groups?.length,
  )
  return (
    <>
      <header className="feed-header feed-discovery">
        <h1 className="visually-hidden">Projects</h1>
        <FeedFilters
          search={search}
          update={update}
          sortControl={
            <label className="sort-control">
              <span className="visually-hidden">Sort posts</span>
              <select
                value={search.sort}
                onChange={(event) =>
                  update(
                    parseFeedSearch({ ...search, sort: event.target.value }),
                  )
                }
              >
                <option value="latest">Newest</option>
                <option value="comments">Most commented</option>
                <option value="bookmarks">Most bookmarked</option>
              </select>
              <span className="sort-label" aria-hidden="true">
                {search.sort === 'latest'
                  ? 'Newest'
                  : search.sort === 'comments'
                    ? 'Comments'
                    : 'Bookmarks'}
              </span>
              <Icon name="chevronDown" />
            </label>
          }
          searchControl={
            <search
              className="feed-search"
              aria-label="Search projects"
              onKeyDown={(event) => {
                if (event.key !== 'Escape') return
                event.preventDefault()
                if (event.target instanceof HTMLElement) event.target.blur()
              }}
            >
              <Icon name="search" className="search-icon" />
              <input
                ref={input}
                type="search"
                aria-label="Search projects or people"
                autoComplete="off"
                placeholder="Search projects…"
                value={search.q}
                maxLength={200}
                onChange={(event) =>
                  update({ ...search, q: event.target.value })
                }
              />
              {search.q && (
                <button
                  type="button"
                  className="search-clear"
                  aria-label="Clear search"
                  onClick={() => {
                    update({ ...search, q: '' })
                    input.current?.focus()
                  }}
                >
                  <Icon name="close" />
                </button>
              )}
            </search>
          }
        />
      </header>
      {needsAccount ? (
        <div className="empty">
          <div className="empty-icon">
            <Icon name={search.bookmarked ? 'bookmark' : 'user'} />
          </div>
          <h2>A feed that’s yours.</h2>
          <p>Sign in to filter by your bookmarks or your own posts.</p>
          <button
            type="button"
            className="button"
            onClick={() => openDialog({ kind: 'signin' })}
          >
            Sign in
          </button>
        </div>
      ) : posts.length ? (
        <>
          <div id="feed-list">
            {posts.map((post) => (
              <PostCard
                post={post}
                key={post.id}
                owner={post.author === user}
              />
            ))}
          </div>
          <div className="end-of-feed">
            <Icon name="check" />
            <span>You’re all caught up.</span>
          </div>
        </>
      ) : (
        <EmptyState
          title={
            narrowed
              ? 'No projects match.'
              : search.bookmarked
                ? 'No bookmarks yet.'
                : 'No projects yet.'
          }
          icon={search.bookmarked ? 'bookmark' : 'search'}
        >
          {narrowed
            ? 'Try removing a filter or changing your search.'
            : search.bookmarked
              ? 'Bookmark a project from the feed to come back to it later.'
              : 'Projects shared by the group will appear here.'}
        </EmptyState>
      )}
    </>
  )
}
