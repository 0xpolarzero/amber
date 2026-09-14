import type { AgentMessage } from '../preview/state'
import { Icon } from './icon'
import { PostChangeDiff } from './post-change-diff'
import { TraceStep } from './workflow-trace'

export function RecordedWorkflowTrace({
  trace,
}: {
  trace: NonNullable<AgentMessage['recordedTrace']>
}) {
  return (
    <details className="workflow-trace recorded-workflow">
      <summary aria-label="Workflow trace">
        <span className="workflow-trace-toggle-icons">
          <Icon name="spark" />
          <Icon name="chevronDown" className="workflow-trace-caret" />
        </span>
        <span className="visually-hidden">Workflow trace</span>
        <span className="workflow-trace-count">Recorded</span>
      </summary>
      <div className="workflow-trace-content">
        <ol
          className="workflow-trace-steps"
          aria-label="Recorded workflow stages"
        >
          {trace.stages.map((stage, index) => (
            <TraceStep
              // biome-ignore lint/suspicious/noArrayIndexKey: Recorded stages are immutable and may contain identical retry calls.
              key={`${index}-${stage.label}`}
              number={index + 1}
              title={stage.label}
              summary={stage.summary}
              status={stage.status}
            >
              {stage.changes?.length ? (
                <section
                  className="trace-post-diffs"
                  aria-label="Applied post changes"
                >
                  {stage.changes.map((change) => (
                    <PostChangeDiff
                      key={change.postId}
                      change={change}
                      expanded
                    />
                  ))}
                </section>
              ) : null}
              <details className="trace-nested">
                <summary>Recorded evidence</summary>
                <pre>{stage.detail}</pre>
              </details>
            </TraceStep>
          ))}
        </ol>
        <p className="trace-recording">
          {trace.group} · {trace.model}
        </p>
      </div>
    </details>
  )
}
