import { Link } from '@tanstack/react-router'
import { type ReactNode, useRef } from 'react'
import { PreviewDialogs } from '../preview/dialogs'
import { usePreview } from '../preview/provider'
import { AccountMenu } from './account-menu'
import { AgentGuide } from './agent-guide'

export function AppShell({ children }: { children: ReactNode }) {
  const { state, user, openDialog, dispatch, notice, unreadCount } =
    usePreview()
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
            {user ? (
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
        className={state.guideStep !== null ? 'guide-active' : undefined}
      >
        {children}
      </main>
      <AgentGuide />
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
