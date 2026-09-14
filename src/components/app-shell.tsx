import { Link, useRouterState } from '@tanstack/react-router'
import { type ReactNode, useRef } from 'react'
import { PreviewDialogs } from '../preview/dialogs'
import { usePreview } from '../preview/provider'
import { AccountMenu } from './account-menu'
import { AgentGuide } from './agent-guide'

export function AppShell({ children }: { children: ReactNode }) {
  const { state, user, openDialog, dispatch, notice, unreadCount } =
    usePreview()
  const onAgentPage = useRouterState({
    select: ({ location }) => location.pathname === '/agent',
  })
  const signIn = useRef<HTMLButtonElement>(null)
  return (
    <>
      <a className="skip" href="#main">
        Skip to content
      </a>
      <header className="topbar">
        <div className="header-inner">
          <Link
            to="/"
            search={{ sort: 'latest', q: '' }}
            className="brand"
            aria-label="Amber home"
          >
            amber
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
            <Link to="/agent" search={{}} activeProps={{ className: 'active' }}>
              Agent
              {user && unreadCount > 0 && (
                <span
                  className="nav-badge"
                  role="img"
                  aria-label={`${unreadCount} unread`}
                >
                  {unreadCount}
                </span>
              )}
            </Link>
          </nav>
          <div className="account">
            {state.realDemo ? (
              <label className="real-author-select">
                <span className="visually-hidden">Preview conversation as</span>
                <select
                  aria-label="Preview conversation as"
                  value={user ?? ''}
                  onChange={(event) =>
                    dispatch({
                      type: 'selectRealAuthor',
                      authorId: event.target.value,
                    })
                  }
                >
                  {Object.keys(state.agentByUser).map((id) => (
                    <option key={id} value={id}>
                      {state.people[id]?.name ?? id}
                    </option>
                  ))}
                </select>
              </label>
            ) : user ? (
              <AccountMenu
                key={user}
                user={user}
                onSignOut={() => {
                  dispatch({ type: 'role', role: 'visitor' })
                  requestAnimationFrame(() => signIn.current?.focus())
                }}
              />
            ) : (
              <button
                type="button"
                className="signin"
                ref={signIn}
                onClick={() => openDialog({ kind: 'signin' })}
              >
                Sign in
              </button>
            )}
          </div>
        </div>
      </header>
      <main
        id="main"
        tabIndex={-1}
        className={onAgentPage && !state.realDemo ? 'guide-active' : undefined}
      >
        {state.realDemo && (
          <div className="real-import-note">
            Local preview · {state.realDemo.processedCount} /{' '}
            {state.realDemo.messageCount} Telegram messages processed ·{' '}
            {new Date(state.realDemo.importedAt).toISOString().slice(0, 10)}
            <span>{state.realDemo.model}</span>
          </div>
        )}
        {children}
      </main>
      {!state.realDemo && <AgentGuide />}
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
