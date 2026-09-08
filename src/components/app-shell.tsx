import { Link } from '@tanstack/react-router'
import { type ReactNode, useRef } from 'react'
import { AGENT_SCENARIOS, type AgentScenarioId } from '../preview/agent-example'
import { PreviewDialogs } from '../preview/dialogs'
import { usePreview } from '../preview/provider'
import { isAgentBusy } from '../preview/state'
import { AccountMenu } from './account-menu'

export function AppShell({ children }: { children: ReactNode }) {
  const { state, user, openDialog, dispatch, notice, unreadCount } =
    usePreview()
  const run = user ? state.agentByUser[user]?.run : undefined
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
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <div className="preview-controls">
        <span>Design preview</span>
        <label>
          <span>Account</span>
          <select
            aria-label="Preview account"
            autoComplete="off"
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
        <label className="scenario-control">
          <span>Scenario</span>
          <select
            aria-label="Agent scenario"
            autoComplete="off"
            value={state.scenarioId}
            onChange={(event) => {
              openDialog(null)
              dispatch({
                type: 'loadScenario',
                id: event.target.value as AgentScenarioId,
              })
            }}
          >
            {AGENT_SCENARIOS.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() =>
            dispatch({ type: 'loadScenario', id: state.scenarioId })
          }
        >
          Reset
        </button>
        <button
          type="button"
          disabled={!run || !isAgentBusy(run)}
          onClick={() =>
            run && dispatch({ type: 'setRunPlaying', playing: !run.autoPlay })
          }
        >
          {run?.autoPlay ? 'Pause' : 'Play'}
        </button>
        <button
          type="button"
          disabled={!run || !isAgentBusy(run)}
          onClick={() =>
            run &&
            dispatch({
              type: 'advanceRun',
              userId: user ?? 'alex',
              messageId: run.messageId,
              stage: run.stage,
              memory: run.memory,
              addressing: run.addressing,
            })
          }
        >
          Step
        </button>
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
