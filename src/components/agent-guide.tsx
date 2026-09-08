import { useNavigate } from '@tanstack/react-router'
import {
  AGENT_GUIDE,
  AGENT_SCENARIOS,
  type AgentScenarioId,
} from '../preview/agent-example'
import { usePreview } from '../preview/provider'
import { isAgentBusy } from '../preview/state'

export function AgentGuide() {
  const { state, user, openDialog, dispatch } = usePreview()
  const navigate = useNavigate()
  const run = user ? state.agentByUser[user]?.run : undefined
  const step = state.guideStep
  const checkpoint = step === null ? undefined : AGENT_GUIDE[step]
  const complete = state.guideComplete
  const goToStep = (next: number) => {
    openDialog(null)
    dispatch({ type: 'loadGuideStep', step: next })
    void navigate({
      to: '/agent',
      search: {},
      resetScroll: false,
    })
  }
  return (
    <aside
      className="preview-controls agent-guide"
      data-active={step !== null}
      aria-label="Amber guided preview"
    >
      <div className="guide-main">
        <div className="guide-copy" role="status" aria-live="polite">
          <span className="guide-kicker">
            {checkpoint
              ? complete
                ? `${AGENT_GUIDE.length} of ${AGENT_GUIDE.length} · Complete · Recorded Gemini run`
                : `${(step ?? 0) + 1} of ${AGENT_GUIDE.length} · Recorded Gemini run · Fake Telegram`
              : 'Amber guided preview'}
          </span>
          <strong>
            {complete ? 'You’ve seen the full flow' : checkpoint?.title}
          </strong>
          <p>
            {complete
              ? `Replay the ${AGENT_GUIDE.length} checkpoints or use More controls to inspect labeled simulations.`
              : (checkpoint?.notice ??
                'See a recorded real Gemini workflow over invented Telegram messages; no model runs in the browser.')}
          </p>
        </div>
        <div className="guide-actions">
          {step === null ? (
            <button
              type="button"
              className="guide-primary"
              onClick={() => goToStep(0)}
            >
              Start
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={step === 0 && !complete}
                onClick={() => goToStep(complete ? step : step - 1)}
              >
                Back
              </button>
              <button type="button" onClick={() => goToStep(0)}>
                {complete ? 'Replay' : 'Restart'}
              </button>
              {!complete ? (
                <button
                  type="button"
                  className="guide-primary"
                  onClick={() => {
                    if (step === AGENT_GUIDE.length - 1)
                      dispatch({ type: 'completeGuide' })
                    else goToStep(step + 1)
                  }}
                >
                  Next
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>
      {checkpoint?.scenarioId === 'failure-addressing' ? (
        <details className="guide-alternatives">
          <summary>Retry safeguards</summary>
          <div>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'loadGuideAlternative',
                  id: 'retry-exhausted',
                })
              }
            >
              Retry limit
            </button>
            <button
              type="button"
              onClick={() =>
                dispatch({
                  type: 'loadGuideAlternative',
                  id: 'retry-stale',
                })
              }
            >
              Stale retry
            </button>
          </div>
        </details>
      ) : null}
      <details className="preview-more">
        <summary>More controls</summary>
        <div className="preview-more-row">
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
      </details>
    </aside>
  )
}
