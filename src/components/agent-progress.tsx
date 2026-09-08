import { usePreview } from '../preview/provider'
import type { AgentRun, BackgroundStatus } from '../preview/state'
import { Icon } from './icon'

const foreground = [
  ['planning', 'Plan queries'],
  ['retrieving', 'Retrieve context'],
  ['generating', 'Generate answer'],
  ['publishing', 'Apply atomic update'],
] as const

const stageIndex = (run: AgentRun) => {
  if (run.published || run.stage === 'background' || run.stage === 'complete')
    return 4
  return foreground.findIndex(([stage]) => stage === run.stage)
}

const taskStatus = (
  run: AgentRun,
  index: number,
): 'complete' | 'running' | 'queued' | 'failed' => {
  const current = stageIndex(run)
  if (run.status === 'failed' && index === current) return 'failed'
  if (index < current) return 'complete'
  if (index === current && run.status === 'running') return 'running'
  return 'queued'
}

const backgroundLabel = (status: BackgroundStatus) =>
  status === 'done'
    ? 'Complete'
    : status === 'running'
      ? 'Running'
      : status === 'failed'
        ? 'Failed'
        : status === 'exhausted'
          ? 'Retry limit reached'
          : 'Queued'

export function AgentProgress({
  run,
  expanded = false,
}: {
  run: AgentRun
  expanded?: boolean
}) {
  const { dispatch } = usePreview()
  const current =
    run.status === 'failed'
      ? 'Turn failed'
      : run.status === 'complete'
        ? run.memory === 'done' && run.addressing === 'done'
          ? 'Complete'
          : 'Response saved; follow-up needs attention'
        : run.stage === 'background'
          ? 'Finishing in the background'
          : (foreground.find(([stage]) => stage === run.stage)?.[1] ??
            'Working')
  const failedJobs = (['memory', 'addressing'] as const).filter(
    (task) => run[task] === 'failed',
  )
  const needsAttention =
    failedJobs.length > 0 ||
    run.stale ||
    run.memory === 'exhausted' ||
    run.addressing === 'exhausted'
  return (
    <details
      className="agent-progress"
      open={expanded || run.status === 'running' || needsAttention}
    >
      <summary>
        <span>Turn progress</span>
        <span
          className="agent-progress-current"
          role="status"
          aria-live="polite"
        >
          {current}
        </span>
        <Icon name="chevron" />
      </summary>
      <ol aria-label="Task progress">
        {foreground.map(([stage, task], index) => {
          const status = taskStatus(run, index)
          return <ProgressTask key={stage} label={task} status={status} />
        })}
        <ProgressTask label="Update memory" status={run.memory} />
        <ProgressTask label="Resolve requests" status={run.addressing} />
      </ol>
      {run.error ? <p className="run-error">{run.error}</p> : null}
      {run.stale ? (
        <p className="run-note">
          A newer turn has started, so this retry is disabled to avoid
          overwriting newer work.
        </p>
      ) : null}
      {run.memory === 'exhausted' || run.addressing === 'exhausted' ? (
        <p className="run-note">
          Retry limit reached. Your answer and post changes remain saved.
        </p>
      ) : null}
      {failedJobs.length > 0 && !run.stale ? (
        <div className="background-retries">
          {failedJobs.map((task) => (
            <button
              key={task}
              type="button"
              onClick={() => dispatch({ type: 'retryBackground', task })}
            >
              Retry {task === 'memory' ? 'memory save' : 'request resolution'}
            </button>
          ))}
        </div>
      ) : null}
      {run.status === 'running' ? (
        <p>
          You can keep drafting. Sending unlocks after both background tasks
          finish.
        </p>
      ) : null}
      <p className="agent-progress-disclosure">
        Illustrative design preview. No model is running.
      </p>
    </details>
  )
}

function ProgressTask({
  label,
  status,
}: {
  label: string
  status: BackgroundStatus | 'complete' | 'running' | 'queued' | 'failed'
}) {
  const normalized = status === 'done' ? 'complete' : status
  const labelStatus =
    status === 'complete'
      ? 'Complete'
      : backgroundLabel(status as BackgroundStatus)
  return (
    <li data-status={normalized}>
      <span className="task-state" aria-hidden="true">
        {normalized === 'complete' ? <Icon name="check" /> : <span />}
      </span>
      {label}
      <span className="visually-hidden">: {labelStatus}</span>
    </li>
  )
}
