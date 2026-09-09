import { useNavigate } from '@tanstack/react-router'
import { usePreview } from '../preview/provider'
import type { AgentRun, AgentRunStage } from '../preview/state'
import { isAgentBusy } from '../preview/state'

const stages = [
  ['planning', 'Plan queries'],
  ['retrieving', 'Retrieve context'],
  ['generating', 'Generate answer'],
  ['publishing', 'Publish answer and changes'],
  ['background', 'Update memory'],
  ['background', 'Resolve requests'],
] as const satisfies readonly (readonly [AgentRunStage, string])[]

const foregroundStages: readonly AgentRunStage[] = [
  'planning',
  'retrieving',
  'generating',
  'publishing',
]

function stageState(run: AgentRun | undefined, index: number) {
  if (!run) return 'queued'
  if (run.stage === 'complete') {
    if (index < 4) return 'complete'
    const status = index === 4 ? run.memory : run.addressing
    return status === 'done'
      ? 'complete'
      : status === 'failed' || status === 'exhausted'
        ? 'failed'
        : 'queued'
  }
  if (run.stage === 'background') return index < 4 ? 'complete' : 'active'
  const active = foregroundStages.indexOf(run.stage)
  if (index < active) return 'complete'
  if (index === active) return run.status === 'failed' ? 'failed' : 'active'
  return 'queued'
}

function inspectStage(index: number) {
  const outer = document.querySelector<HTMLDetailsElement>(
    'details.reply-workflow-trace',
  )
  const stage = document.getElementById(
    `reply-stage-${index + 1}`,
  ) as HTMLDetailsElement | null
  if (!outer || !stage) return
  outer.open = true
  stage.open = true
  stage.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
}

export function AgentGuide() {
  const { state, user, openDialog, dispatch } = usePreview()
  const navigate = useNavigate()
  const run = user ? state.agentByUser[user]?.run : undefined
  const running = isAgentBusy(run)
  const start = (playing: boolean) => {
    openDialog(null)
    dispatch({ type: 'restartRun', playing })
    void navigate({ to: '/agent', search: {}, resetScroll: false })
  }
  const current = !run
    ? 'Ready to replay'
    : run.status === 'complete'
      ? run.memory === 'done' && run.addressing === 'done'
        ? 'Replay complete'
        : 'Background needs attention'
      : run.status === 'failed'
        ? 'Simulation stopped'
        : run.stage === 'background'
          ? 'Update memory + Resolve requests'
          : stages.find(([stage]) => stage === run.stage)?.[1]

  return (
    <aside
      className="preview-controls agent-guide"
      data-active={running || undefined}
      aria-label="Amber recorded replay"
    >
      <div className="guide-main">
        <div className="guide-copy" role="status" aria-live="polite">
          <span className="guide-kicker">
            Simulated timing · 0.5s per reveal · recorded Gemini output
          </span>
          <strong>{current}</strong>
          <p>Historical turn live-turn-2. No model runs in this preview.</p>
        </div>
        <div className="guide-actions">
          <button type="button" onClick={() => start(false)}>
            Restart
          </button>
          <button
            type="button"
            className="guide-primary"
            onClick={() => {
              if (!running) start(true)
              else
                dispatch({
                  type: 'setRunPlaying',
                  playing: !(run?.autoPlay ?? false),
                })
            }}
          >
            {running && run?.autoPlay ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
      <ol className="replay-stages" aria-label="Replay stages">
        {stages.map(([, label], index) => (
          <li key={label} data-state={stageState(run, index)}>
            <button
              type="button"
              disabled={!run}
              onClick={() => {
                dispatch({ type: 'setRunPlaying', playing: false })
                inspectStage(index)
              }}
              aria-label={`Inspect stage ${index + 1}: ${label}`}
            >
              <span>{index + 1}</span>
              {label}
            </button>
          </li>
        ))}
      </ol>
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
          <button
            type="button"
            onClick={() =>
              dispatch({
                type: 'loadScenario',
                id: 'failure-before-publication',
              })
            }
          >
            Foreground failure
          </button>
          <button
            type="button"
            onClick={() =>
              dispatch({ type: 'loadScenario', id: 'failure-addressing' })
            }
          >
            Background failure
          </button>
          <a href="/plan" target="_blank" rel="noreferrer">
            Plan ↗
          </a>
        </div>
      </details>
    </aside>
  )
}
