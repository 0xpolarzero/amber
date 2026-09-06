import { useNavigate } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '../components/empty-state'
import { FeedFilters } from '../components/feed-filters'
import { Icon } from '../components/icon'
import { PostCard } from '../components/post-card'
import { type FeedSearch, parseFeedSearch, selectPosts } from '../domain/feed'
import { usePreview } from '../preview/provider'

export function FeedPage({ search }: { search: FeedSearch }) {
  const { state, saved, user, openDialog } = usePreview()
  const navigate = useNavigate()
  const [searchOpen, setSearchOpen] = useState(Boolean(search.q))
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
      setSearchOpen(true)
      requestAnimationFrame(() => input.current?.focus())
    }
    document.addEventListener('keydown', shortcut)
    return () => document.removeEventListener('keydown', shortcut)
  }, [])
  const posts = selectPosts(state, search, saved, user)
  const needsAccount =
    !user && (search.bookmarked || search.authors?.includes('me'))
  const narrowed = Boolean(search.q || search.authors?.length)
  return (
    <>
      <header className="feed-header">
        <div className="heading-line">
          <h1>From the group</h1>
          <div className="feed-controls">
            <label className="sort-control">
              <span className="visually-hidden">Sort posts</span>
              <select
                value={search.sort}
                style={{
                  width:
                    search.sort === 'latest'
                      ? 80
                      : search.sort === 'comments'
                        ? 142
                        : 150,
                }}
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
              <Icon name="chevronDown" />
            </label>
            <button
              type="button"
              className={`icon-button ${searchOpen ? 'active' : ''}`}
              aria-label="Search posts"
              aria-expanded={searchOpen || Boolean(search.q)}
              aria-controls="feed-search"
              onClick={() => {
                setSearchOpen(true)
                requestAnimationFrame(() => input.current?.focus())
              }}
            >
              <Icon name="search" />
            </button>
          </div>
        </div>
        <p className="feed-subtitle">
          Small projects, shared by the people making them.
        </p>
        <FeedFilters search={search} update={update} />
        <div
          className="search-box"
          hidden={!searchOpen && !search.q}
          id="feed-search"
        >
          <label className="visually-hidden" htmlFor="search-posts">
            Search projects or people
          </label>
          <input
            id="search-posts"
            ref={input}
            type="search"
            autoComplete="off"
            placeholder="Search projects or people…"
            value={search.q}
            maxLength={200}
            onChange={(event) => update({ ...search, q: event.target.value })}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                update({ ...search, q: '' })
                setSearchOpen(false)
              }
            }}
          />
          <button
            type="button"
            className="icon-button"
            aria-label="Close search"
            onClick={() => {
              update({ ...search, q: '' })
              setSearchOpen(false)
            }}
          >
            <Icon name="close" />
          </button>
        </div>
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
