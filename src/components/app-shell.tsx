import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { PreviewDialogs } from '../preview/dialogs'
import { usePreview } from '../preview/provider'
import { Avatar } from './avatar'

export function AppShell({ children }: { children: ReactNode }) {
  const { state, user, openDialog, dispatch, notice } = usePreview()
  const waiting = state.posts.some(
    (post) => post.author === user && post.question,
  )
  return (
    <>
      <a className="skip" href="#main">
        Skip to feed
      </a>
      <header className="topbar">
        <div className="header-inner">
          <Link
            to="/"
            search={{ sort: 'latest', q: '' }}
            className="brand"
            aria-label="Field home"
          >
            field
            <span className="brand-dot" aria-hidden="true" />
          </Link>
          <nav className="global-nav" aria-label="Main navigation">
            <Link
              to="/"
              search={{ sort: 'latest', q: '' }}
              activeOptions={{ exact: true, includeSearch: false }}
              activeProps={{ className: 'active' }}
            >
              Feed
            </Link>
            <Link
              to="/saved"
              search={{ sort: 'latest', q: '' }}
              activeOptions={{ includeSearch: false }}
              activeProps={{ className: 'active' }}
            >
              Saved
            </Link>
            {user && (
              <Link
                to="/dashboard"
                activeProps={{ className: 'active' }}
                data-route="mine"
              >
                My posts
                {waiting && (
                  <span
                    className="nav-dot"
                    role="img"
                    aria-label="Question waiting"
                  />
                )}
              </Link>
            )}
          </nav>
          <div className="account">
            {user ? (
              <button
                type="button"
                className="avatar-button"
                aria-label="Your account"
                onClick={() => openDialog({ kind: 'account' })}
              >
                <Avatar personId={user} />
              </button>
            ) : (
              <button
                type="button"
                className="signin"
                onClick={() => openDialog({ kind: 'signin' })}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <div className="preview-controls">
        <span>Design preview</span>
        <span>Sample content</span>
        <label>
          <span className="visually-hidden">Preview account</span>
          <select
            value={state.role}
            onChange={(event) => {
              const role = event.target.value
              if (
                role === 'visitor' ||
                role === 'member' ||
                role === 'author'
              ) {
                openDialog(null)
                dispatch({ type: 'role', role })
              }
            }}
          >
            <option value="visitor">Visitor</option>
            <option value="member">Member</option>
            <option value="author">Author</option>
          </select>
        </label>
        <a href="/plan" target="_blank" rel="noreferrer">
          Plan ↗
        </a>
      </div>
      <div
        className={`toast ${notice ? 'show' : ''}`}
        role="status"
        aria-live="polite"
      >
        {notice}
      </div>
      <PreviewDialogs />
    </>
  )
}
