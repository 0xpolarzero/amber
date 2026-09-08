import type { ReactNode } from 'react'
import { Icon } from './icon'

export type TraceStepStatus =
  | 'complete'
  | 'running'
  | 'queued'
  | 'failed'
  | 'exhausted'

const statusLabel = (status: TraceStepStatus) =>
  status === 'complete'
    ? 'Complete'
    : status === 'running'
      ? 'Running'
      : status === 'failed'
        ? 'Failed'
        : status === 'exhausted'
          ? 'Retry limit reached'
          : 'Queued'

export function TraceStep({
  number,
  title,
  summary,
  status,
  open = false,
  children,
}: {
  number: number
  title: string
  summary: string
  status?: TraceStepStatus
  open?: boolean
  children?: ReactNode
}) {
  const effectiveStatus = status ?? 'complete'
  return (
    <li data-status={effectiveStatus}>
      <details className="workflow-trace-step" open={open}>
        <summary>
          <span className="trace-step-number">
            {status === 'complete' ? <Icon name="check" /> : number}
          </span>
          <span className="trace-step-copy">
            <strong>
              {title}
              {status ? (
                <span className="visually-hidden">
                  : {statusLabel(effectiveStatus)}
                </span>
              ) : null}
            </strong>
            <span>{summary}</span>
          </span>
          {children ? <Icon name="chevronDown" /> : null}
        </summary>
        {children ? <div className="trace-evidence">{children}</div> : null}
      </details>
    </li>
  )
}

export function TraceCollection({
  title,
  empty,
  items,
}: {
  title: string
  empty: string
  items: readonly { id: string; title: string; text: string }[]
}) {
  return (
    <div className="trace-collection">
      <strong>{title}</strong>
      {items.length ? (
        items.map((item) => (
          <div className="trace-record" key={item.id}>
            <span>{item.title}</span>
            <p>{item.text}</p>
          </div>
        ))
      ) : (
        <p>{empty}</p>
      )}
    </div>
  )
}
