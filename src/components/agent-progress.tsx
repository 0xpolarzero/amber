import { type AgentRun, isAgentBusy } from '../preview/state'
import { Icon } from './icon'

const tasks = [
  'Plan retrieval',
  'Read context',
  'Write reply',
  'Publish changes',
  'Update memory',
  'Resolve messages',
] as const

export function AgentProgress({ run }: { run: AgentRun }) {
  const busy = isAgentBusy(run)
  return (
    <details className="agent-progress" open={busy}>
      <summary>
        <span>Workflow preview</span>
        <span className="agent-progress-current" role="status">
          {busy
            ? run.step === 4
              ? 'Finishing in parallel'
              : tasks[run.step]
            : 'Example complete'}
        </span>
        <Icon name="chevron" />
      </summary>
      <ol aria-label="Task progress">
        {tasks.map((task, index) => {
          const running = index === run.step || (run.step === 4 && index === 5)
          const status =
            index < run.step ? 'Complete' : running ? 'Running' : 'Queued'
          return (
            <li key={task} data-status={status.toLowerCase()}>
              <span className="task-state" aria-hidden="true">
                {status === 'Complete' ? <Icon name="check" /> : <span />}
              </span>
              {task}
              <span className="visually-hidden">: {status}</span>
            </li>
          )
        })}
      </ol>
      <p>
        Example timing; no model is running. {busy && 'You can keep drafting.'}
      </p>
    </details>
  )
}
