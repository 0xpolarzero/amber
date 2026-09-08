import { usePreview } from '../preview/provider'
import type {
  AgentRun,
  BackgroundStatus,
  ReplyWorkflowTrace,
} from '../preview/state'
import { Icon } from './icon'
import {
  TraceCollection,
  TraceStep,
  type TraceStepStatus,
} from './workflow-trace'

const foreground = [
  ['planning', 'Plan queries'],
  ['retrieving', 'Retrieve context'],
  ['generating', 'Generate answer'],
  ['publishing', 'Publish answer and changes'],
] as const

const stageIndex = (run: AgentRun) => {
  if (run.published || run.stage === 'background' || run.stage === 'complete')
    return 4
  return foreground.findIndex(([stage]) => stage === run.stage)
}

const taskStatus = (run: AgentRun, index: number): TraceStepStatus => {
  const current = stageIndex(run)
  if (run.status === 'failed' && index === current) return 'failed'
  if (index < current) return 'complete'
  if (index === current && run.status === 'running') return 'running'
  return 'queued'
}

const normalizeBackground = (status: BackgroundStatus): TraceStepStatus =>
  status === 'done' ? 'complete' : status

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

const count = (value: number, noun: string) =>
  `${value} ${noun}${value === 1 ? '' : 's'}`

export function AgentProgress({
  run,
  expanded = false,
}: {
  run: AgentRun
  expanded?: boolean
}) {
  const { dispatch, agent } = usePreview()
  const trace = testTrace(run.trace)
  const current =
    run.status === 'failed'
      ? 'Turn failed'
      : run.status === 'complete'
        ? run.memory === 'done' && run.addressing === 'done'
          ? 'Complete'
          : 'Response saved; follow-up needs attention'
        : run.stage === 'background'
          ? 'Finishing after publication'
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
  const foregroundStatuses = foreground.map((_, index) =>
    taskStatus(run, index),
  )
  return (
    <details
      className="workflow-trace reply-workflow-trace agent-progress"
      data-pending-answer={!run.published || undefined}
      open={
        !run.published || expanded || run.status === 'running' || needsAttention
      }
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Native summary activation is disabled until publication. */}
      <summary
        aria-label="Reply workflow"
        aria-disabled={!run.published || undefined}
        tabIndex={run.published ? undefined : -1}
        onClick={(event) => {
          if (!run.published) event.preventDefault()
        }}
      >
        <span className="workflow-trace-toggle-icons">
          <Icon name="workflow" />
          <Icon name="chevronDown" className="workflow-trace-caret" />
        </span>
        <span>Reply workflow</span>
        <span
          className="agent-progress-current"
          role="status"
          aria-live="polite"
        >
          {current}
        </span>
      </summary>
      <div className="workflow-trace-content">
        <ol className="workflow-trace-steps" aria-label="Task progress">
          <TraceStep
            number={1}
            title="Plan queries"
            status={foregroundStatuses[0]}
            summary={plannerSummary(trace, foregroundStatuses[0])}
          >
            {foregroundStatuses[0] === 'complete' ? (
              <PlannerEvidence trace={trace} />
            ) : null}
          </TraceStep>
          <TraceStep
            number={2}
            title="Retrieve context"
            status={foregroundStatuses[1]}
            summary={contextSummary(trace, foregroundStatuses[1])}
          >
            {foregroundStatuses[1] === 'complete' ? (
              <ContextEvidence trace={trace} />
            ) : null}
          </TraceStep>
          <TraceStep
            number={3}
            title="Generate answer"
            status={foregroundStatuses[2]}
            summary={generationSummary(trace, foregroundStatuses[2])}
          >
            {foregroundStatuses[2] === 'complete' ? (
              <GeneratedEvidence trace={trace} />
            ) : null}
          </TraceStep>
          <TraceStep
            number={4}
            title="Publish answer and changes"
            status={foregroundStatuses[3]}
            summary={publicationSummary(trace, foregroundStatuses[3])}
          >
            {foregroundStatuses[3] === 'complete' ? (
              <div className="trace-record">
                <strong>Published in this reply</strong>
                <p>
                  Answer {run.outcome?.responseId ?? 'record'} and its supported
                  changes are visible above.
                </p>
                <span>
                  {count(trace.response.postChanges.length, 'post change')}{' '}
                  applied atomically.
                </span>
              </div>
            ) : null}
          </TraceStep>
          <TraceStep
            number={5}
            title="Update memory"
            status={normalizeBackground(run.memory)}
            summary={memorySummary(trace, run.memory)}
          >
            {run.memory === 'done' ? <MemoryEvidence trace={trace} /> : null}
          </TraceStep>
          <TraceStep
            number={6}
            title="Resolve requests"
            status={normalizeBackground(run.addressing)}
            summary={addressingSummary(trace, run.addressing)}
          >
            {run.addressing === 'done' ? (
              <AddressingEvidence trace={trace} />
            ) : null}
          </TraceStep>
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
        {failedJobs.length > 0 &&
        !run.stale &&
        agent?.run?.messageId === run.messageId ? (
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
      </div>
    </details>
  )
}

function testTrace(trace: ReplyWorkflowTrace): ReplyWorkflowTrace {
  if (
    import.meta.env.VITE_AMBER_E2E !== 'true' ||
    typeof window === 'undefined'
  )
    return trace
  return (
    (window as Window & { __amberTestReplyTrace?: ReplyWorkflowTrace })
      .__amberTestReplyTrace ?? trace
  )
}

const incompleteSummary = (status: TraceStepStatus, running: string) =>
  status === 'running'
    ? running
    : status === 'failed'
      ? 'Stopped here. No later output was applied.'
      : 'Waiting for the prior stage.'

function plannerSummary(trace: ReplyWorkflowTrace, status: TraceStepStatus) {
  if (status !== 'complete')
    return incompleteSummary(status, 'Choosing the required context.')
  return trace.planner.queries.length
    ? `${count(trace.planner.queries.length, 'additional query')} planned.`
    : 'No additional queries.'
}

function contextSummary(trace: ReplyWorkflowTrace, status: TraceStepStatus) {
  if (status !== 'complete')
    return incompleteSummary(status, 'Loading supplied and queried records.')
  const records =
    trace.context.posts.length +
    trace.context.userMessages.length +
    trace.context.assistantMessages.length +
    trace.context.memories.length +
    trace.context.unaddressed.length
  return `${count(records, 'context record')} supplied.`
}

function generationSummary(trace: ReplyWorkflowTrace, status: TraceStepStatus) {
  if (status !== 'complete')
    return incompleteSummary(status, 'Preparing a supported answer.')
  return `${count(trace.response.postChanges.length, 'post change')} prepared with the answer.`
}

function publicationSummary(
  trace: ReplyWorkflowTrace,
  status: TraceStepStatus,
) {
  if (status !== 'complete')
    return incompleteSummary(
      status,
      'Applying the answer and post changes atomically.',
    )
  return `Answer published with ${count(trace.response.postChanges.length, 'post change')}.`
}

function memorySummary(trace: ReplyWorkflowTrace, status: BackgroundStatus) {
  if (status !== 'done')
    return status === 'running'
      ? 'Checking for durable preference changes.'
      : backgroundLabel(status)
  return trace.memory.operations.length
    ? `${count(trace.memory.operations.length, 'memory change')} saved.`
    : 'Existing preference retained; no duplicate memory.'
}

function addressingSummary(
  trace: ReplyWorkflowTrace,
  status: BackgroundStatus,
) {
  if (status !== 'done')
    return status === 'running'
      ? 'Checking which requests the answer addressed.'
      : backgroundLabel(status)
  return `${count(trace.addressing.resolutions.length, 'request')} resolved after publication.`
}

const queryResource = (resource: string) =>
  resource === 'posts'
    ? 'Posts'
    : resource === 'user_messages'
      ? 'Your messages'
      : 'Amber messages'

function PlannerEvidence({ trace }: { trace: ReplyWorkflowTrace }) {
  if (!trace.planner.queries.length)
    return (
      <div className="trace-record">
        <strong>No additional queries</strong>
        <p>The linked request already identified the relevant post.</p>
      </div>
    )
  return (
    <div className="trace-messages">
      {trace.planner.queries.map((query) => (
        <div
          className="trace-record"
          key={`${query.resource}-${query.terms.join('-')}-${query.limit}`}
        >
          <strong>Database: {queryResource(query.resource)}</strong>
          <p>Terms: {query.terms.join(', ')}</p>
          <span>Return up to {query.limit} results</span>
        </div>
      ))}
    </div>
  )
}

function ContextEvidence({ trace }: { trace: ReplyWorkflowTrace }) {
  const linkedIds = new Set(trace.context.linkedRequestPostIds)
  const linked = trace.context.posts.filter(({ id }) => linkedIds.has(id))
  const queried = trace.context.posts.filter(({ id }) => !linkedIds.has(id))
  return (
    <>
      <TraceCollection
        title="Linked post context"
        empty="No linked post context was supplied."
        items={linked.map((post) => ({
          id: post.id,
          title: `${post.title} · v${post.version}`,
          text: `${post.summary}\n${post.detail}`,
        }))}
      />
      {trace.planner.queries.some(({ resource }) => resource === 'posts') ? (
        <TraceCollection
          title="Post query results"
          empty="No posts matched the recorded query."
          items={queried.map((post) => ({
            id: post.id,
            title: `${post.title} · v${post.version}`,
            text: post.summary,
          }))}
        />
      ) : null}
      <TraceCollection
        title="User message results"
        empty="No user message results."
        items={trace.context.userMessages.map((message) => ({
          id: message.id,
          title: message.id,
          text: message.text,
        }))}
      />
      <TraceCollection
        title="Amber message results"
        empty="No Amber message results."
        items={trace.context.assistantMessages.map((message) => ({
          id: message.id,
          title: message.id,
          text: message.text,
        }))}
      />
      <TraceCollection
        title="Saved preferences"
        empty="No saved preferences were supplied."
        items={trace.context.memories.map((memory) => ({
          id: memory.id,
          title: 'Writing preference',
          text: memory.text,
        }))}
      />
      <TraceCollection
        title="Pending requests"
        empty="No pending requests were supplied."
        items={trace.context.unaddressed.map((request) => ({
          id: request.id,
          title: request.linkedPostId
            ? `Linked to ${request.linkedPostId}`
            : 'Conversation request',
          text: request.text,
        }))}
      />
    </>
  )
}

function GeneratedEvidence({ trace }: { trace: ReplyWorkflowTrace }) {
  return (
    <>
      <div className="trace-record">
        <strong>Generated answer</strong>
        <p>{trace.response.text}</p>
        <span>
          {trace.response.classification} · {trace.response.intent}
        </span>
      </div>
      <TraceCollection
        title="Prepared post changes"
        empty="No post changes were prepared."
        items={trace.response.postChanges.map((change) => ({
          id: change.postId,
          title: `${change.title} · from v${change.expectedVersion}`,
          text: `${change.summary}\n${change.detail}`,
        }))}
      />
    </>
  )
}

function MemoryEvidence({ trace }: { trace: ReplyWorkflowTrace }) {
  return (
    <>
      {trace.memory.operations.length ? (
        <TraceCollection
          title="Memory changes"
          empty="No memory changes."
          items={trace.memory.operations.map((operation, index) => ({
            id: `${operation.id}-${index}`,
            title: `${operation.kind} ${operation.id}`,
            text: operation.text ?? 'Preference removed.',
          }))}
        />
      ) : (
        <div className="trace-record">
          <strong>No new memory saved</strong>
          <p>The matching preference already existed, so Amber kept it once.</p>
        </div>
      )}
      <TraceCollection
        title="Existing preference retained"
        empty="No existing preference was supplied."
        items={trace.memory.existing.map((memory) => ({
          id: memory.id,
          title: 'Writing preference',
          text: memory.text,
        }))}
      />
    </>
  )
}

function AddressingEvidence({ trace }: { trace: ReplyWorkflowTrace }) {
  return (
    <div className="trace-messages">
      {trace.addressing.resolutions.map((resolution) => {
        const request = trace.addressing.requests.find(
          ({ id }) => id === resolution.requestMessageId,
        )
        return (
          <div className="trace-record" key={resolution.requestMessageId}>
            <strong>
              {resolution.outcome === 'answered'
                ? 'Request answered'
                : 'Request ignored'}
            </strong>
            {request ? <p>{request.text}</p> : null}
            <span>{resolution.reason}</span>
          </div>
        )
      })}
    </div>
  )
}
