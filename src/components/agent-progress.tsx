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

const count = (value: number, noun: string) =>
  `${value} ${value === 1 ? noun : noun === 'query' ? 'queries' : `${noun}s`}`

const stageIndex = (run: AgentRun) => {
  if (run.published || run.stage === 'background' || run.stage === 'complete')
    return 4
  return foreground.findIndex(([stage]) => stage === run.stage)
}

const foregroundStatus = (run: AgentRun, index: number): TraceStepStatus => {
  const current = stageIndex(run)
  if (run.status === 'failed' && index === current) return 'failed'
  if (index < current) return 'complete'
  if (index === current && run.status === 'running') return 'running'
  return 'queued'
}

const normalizeBackground = (status: BackgroundStatus): TraceStepStatus =>
  status === 'done' ? 'complete' : status

const queryResource = (resource: string) =>
  resource === 'posts'
    ? 'Posts'
    : resource === 'user_messages'
      ? 'Your messages'
      : 'Amber messages'

const visibleFrame = (run: AgentRun, status: TraceStepStatus): number =>
  status === 'complete' ? Number.POSITIVE_INFINITY : run.frame

export function AgentProgress({ run }: { run: AgentRun }) {
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
          ? 'Finishing memory + requests in parallel'
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
  const statuses = foreground.map((_, index) => foregroundStatus(run, index))
  const memoryStatus = normalizeBackground(run.memory)
  const addressingStatus = normalizeBackground(run.addressing)

  return (
    <details
      className="workflow-trace reply-workflow-trace agent-progress"
      data-pending-answer={!run.published || undefined}
      open={!run.published || run.status === 'running' || needsAttention}
    >
      {/* biome-ignore lint/a11y/noStaticElementInteractions: Pending output must stay visible. */}
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
            id="reply-stage-1"
            number={1}
            title="Plan queries"
            status={statuses[0]}
            open={statuses[0] === 'running'}
            summary={plannerSummary(trace, statuses[0], run.frame)}
          >
            {statuses[0] === 'complete' || statuses[0] === 'running' ? (
              <PlannerEvidence
                trace={trace}
                visible={visibleFrame(run, statuses[0])}
              />
            ) : null}
          </TraceStep>
          <TraceStep
            id="reply-stage-2"
            number={2}
            title="Retrieve context"
            status={statuses[1]}
            open={statuses[1] === 'running'}
            summary={contextSummary(trace, statuses[1], run.frame)}
          >
            {statuses[1] === 'complete' || statuses[1] === 'running' ? (
              <ContextEvidence
                trace={trace}
                visible={visibleFrame(run, statuses[1])}
              />
            ) : null}
          </TraceStep>
          <TraceStep
            id="reply-stage-3"
            number={3}
            title="Generate answer"
            status={statuses[2]}
            open={statuses[2] === 'running'}
            summary={generationSummary(trace, statuses[2], run.frame)}
          >
            {statuses[2] === 'complete' || statuses[2] === 'running' ? (
              <GeneratedEvidence
                trace={trace}
                visible={visibleFrame(run, statuses[2])}
              />
            ) : null}
          </TraceStep>
          <TraceStep
            id="reply-stage-4"
            number={4}
            title="Publish answer and changes"
            status={statuses[3]}
            open={statuses[3] === 'running'}
            summary={publicationSummary(trace, statuses[3], run.frame)}
          >
            {statuses[3] === 'complete' || statuses[3] === 'running' ? (
              <PublicationEvidence
                trace={trace}
                visible={visibleFrame(run, statuses[3])}
              />
            ) : null}
          </TraceStep>
          <TraceStep
            id="reply-stage-5"
            number={5}
            title="Update memory"
            status={memoryStatus}
            open={memoryStatus === 'running'}
            summary={memorySummary(trace, run.memory, run.frame)}
          >
            {memoryStatus === 'complete' || memoryStatus === 'running' ? (
              <MemoryEvidence
                trace={trace}
                visible={visibleFrame(run, memoryStatus)}
              />
            ) : null}
          </TraceStep>
          <TraceStep
            id="reply-stage-6"
            number={6}
            title="Resolve requests"
            status={addressingStatus}
            open={addressingStatus === 'running'}
            summary={addressingSummary(trace, run.addressing, run.frame)}
          >
            {addressingStatus === 'complete' ||
            addressingStatus === 'running' ? (
              <AddressingEvidence
                trace={trace}
                visible={visibleFrame(run, addressingStatus)}
              />
            ) : null}
          </TraceStep>
        </ol>
        {trace.recording ? (
          <p className="trace-recording">
            {trace.recording.source} · {trace.recording.turnId} ·{' '}
            {trace.recording.model} ·{' '}
            {trace.recording.scripted ? 'scripted' : 'real model'}
          </p>
        ) : null}
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

const waiting = (status: TraceStepStatus, active: string) =>
  status === 'running'
    ? active
    : status === 'failed'
      ? 'Stopped here. No later output was applied.'
      : 'Waiting'

function plannerSummary(
  trace: ReplyWorkflowTrace,
  status: TraceStepStatus,
  frame: number,
) {
  if (status === 'complete')
    return `${count(trace.planner.queries.length, 'query')} planned.`
  if (status !== 'running') return waiting(status, '')
  return frame
    ? `${count(Math.min(frame, trace.planner.queries.length), 'query')} planned.`
    : 'Planning queries…'
}

const contextCount = (trace: ReplyWorkflowTrace) =>
  trace.context.posts.length +
  trace.context.userMessages.length +
  trace.context.assistantMessages.length +
  trace.context.memories.length +
  trace.context.unaddressed.length

function contextSummary(
  trace: ReplyWorkflowTrace,
  status: TraceStepStatus,
  frame: number,
) {
  if (status === 'complete')
    return `${count(contextCount(trace), 'record')} retrieved.`
  if (status !== 'running') return waiting(status, '')
  return frame
    ? `${count(Math.min(frame, contextCount(trace)), 'record')} found.`
    : 'Finding relevant context…'
}

function generationSummary(
  trace: ReplyWorkflowTrace,
  status: TraceStepStatus,
  frame: number,
) {
  if (status === 'complete')
    return `Answer and ${count(trace.response.postChanges.length, 'change')} prepared.`
  if (status !== 'running') return waiting(status, '')
  return frame ? 'Writing answer and changes…' : 'Preparing answer…'
}

function publicationSummary(
  trace: ReplyWorkflowTrace,
  status: TraceStepStatus,
  frame: number,
) {
  if (status === 'complete')
    return `Answer published with ${count(trace.response.postChanges.length, 'change')}.`
  if (status !== 'running') return waiting(status, '')
  return frame
    ? 'Answer and edits ready to publish together.'
    : 'Preparing publication…'
}

function memorySummary(
  trace: ReplyWorkflowTrace,
  status: BackgroundStatus,
  frame: number,
) {
  if (status === 'done')
    return `${count(trace.memory.operations.length, 'preference')} saved.`
  if (status === 'running')
    return frame ? 'Preference update ready.' : 'Checking preferences…'
  return status === 'failed'
    ? 'Failed'
    : status === 'exhausted'
      ? 'Retry limit reached'
      : 'After publication'
}

function addressingSummary(
  trace: ReplyWorkflowTrace,
  status: BackgroundStatus,
  frame: number,
) {
  if (status === 'done')
    return trace.addressing.resolutions.length
      ? `${count(trace.addressing.resolutions.length, 'request')} resolved.`
      : `${count(trace.addressing.requests.length, 'request')} still pending.`
  if (status === 'running')
    return frame ? 'Requests checked.' : 'Checking pending requests…'
  return status === 'failed'
    ? 'Failed'
    : status === 'exhausted'
      ? 'Retry limit reached'
      : 'After publication'
}

function LoadingEvidence({ label }: { label: string }) {
  return (
    <div className="trace-loading" role="status">
      <span aria-hidden="true" />
      {label}
    </div>
  )
}

function PlannerEvidence({
  trace,
  visible,
}: {
  trace: ReplyWorkflowTrace
  visible: number
}) {
  const queries = trace.planner.queries.slice(0, visible)
  if (!queries.length)
    return <LoadingEvidence label="Looking for relevant searches…" />
  return (
    <div className="trace-messages">
      {queries.map((query) => (
        <div
          className="trace-record trace-query"
          key={`${query.resource}-${query.terms.join('-')}`}
        >
          <span className="trace-query-source">
            {queryResource(query.resource)}
          </span>
          <span className="trace-query-terms">{query.terms.join(' · ')}</span>
          <span
            className="trace-query-limit"
            title={`Up to ${query.limit} results`}
          >
            ≤{query.limit}
          </span>
        </div>
      ))}
    </div>
  )
}

function ContextEvidence({
  trace,
  visible,
}: {
  trace: ReplyWorkflowTrace
  visible: number
}) {
  let remaining = visible
  const take = <T,>(items: readonly T[]) => {
    const shown = items.slice(0, remaining)
    remaining = Math.max(0, remaining - items.length)
    return shown
  }
  const posts = take(trace.context.posts)
  const userMessages = take(trace.context.userMessages)
  const assistantMessages = take(trace.context.assistantMessages)
  const memories = take(trace.context.memories)
  const requests = take(trace.context.unaddressed)
  if (!visible) return <LoadingEvidence label="Searching…" />
  return (
    <>
      <TraceCollection
        title="Posts"
        empty="No post results revealed yet."
        items={posts.map((post) => ({
          id: post.id,
          title: post.title,
          text: `${post.summary}\n${post.detail}`,
        }))}
      />
      {userMessages.length ? (
        <TraceCollection
          title="Earlier messages"
          empty="No user messages."
          items={userMessages.map((message) => ({
            id: message.id,
            title: '',
            text: message.text,
          }))}
        />
      ) : null}
      {assistantMessages.length ? (
        <TraceCollection
          title="Earlier replies"
          empty="No Amber messages."
          items={assistantMessages.map((message) => ({
            id: message.id,
            title: '',
            text: message.text,
          }))}
        />
      ) : null}
      {memories.length ? (
        <TraceCollection
          title="Preferences"
          empty="No saved preference."
          items={memories.map((memory) => ({
            id: memory.id,
            title: '',
            text: memory.text,
          }))}
        />
      ) : null}
      {requests.length ? (
        <TraceCollection
          title="Pending request"
          empty="No pending request."
          items={requests.map((request) => ({
            id: request.id,
            title: request.linkedPostId
              ? (trace.context.posts.find(
                  ({ id }) => id === request.linkedPostId,
                )?.title ?? '')
              : '',
            text: request.text,
          }))}
        />
      ) : null}
    </>
  )
}

function partialWords(text: string, frame: number) {
  if (!Number.isFinite(frame)) return text
  const words = text.split(' ')
  return words
    .slice(0, Math.ceil((words.length * Math.min(frame, 3)) / 3))
    .join(' ')
}

function GeneratedEvidence({
  trace,
  visible,
}: {
  trace: ReplyWorkflowTrace
  visible: number
}) {
  if (!visible) return <LoadingEvidence label="Writing…" />
  return (
    <>
      <div className="trace-record">
        <strong>Answer</strong>
        <p>{partialWords(trace.response.text, visible)}</p>
      </div>
      <TraceCollection
        title="Post edits"
        empty="No post changes revealed yet."
        items={trace.response.postChanges.slice(0, visible).map((change) => ({
          id: change.postId,
          title: change.title,
          text: `${change.summary}\n${change.detail}`,
        }))}
      />
    </>
  )
}

function PublicationEvidence({
  trace,
  visible,
}: {
  trace: ReplyWorkflowTrace
  visible: number
}) {
  if (!visible)
    return <LoadingEvidence label="Publishing answer and edits together…" />
  return (
    <div className="trace-record">
      <strong>
        Answer + {count(trace.response.postChanges.length, 'post edit')}
      </strong>
      <p>{trace.response.postChanges.map(({ title }) => title).join(' · ')}</p>
    </div>
  )
}

function MemoryEvidence({
  trace,
  visible,
}: {
  trace: ReplyWorkflowTrace
  visible: number
}) {
  if (!visible) return <LoadingEvidence label="Checking preferences…" />
  return (
    <TraceCollection
      title="Preferences"
      empty="No changes needed."
      items={trace.memory.operations.map((operation, index) => ({
        id: `${operation.id}-${index}`,
        title:
          operation.kind === 'delete'
            ? 'Removed'
            : operation.kind === 'update'
              ? 'Updated'
              : 'Added',
        text: operation.text ?? 'Preference removed.',
      }))}
    />
  )
}

function AddressingEvidence({
  trace,
  visible,
}: {
  trace: ReplyWorkflowTrace
  visible: number
}) {
  if (!visible) return <LoadingEvidence label="Checking requests…" />
  if (!trace.addressing.resolutions.length)
    return (
      <div className="trace-record">
        <strong>Still pending</strong>
        {trace.addressing.requests.map((request) => (
          <p key={request.id}>{request.text}</p>
        ))}
      </div>
    )
  return (
    <div className="trace-messages">
      {trace.addressing.resolutions.map((resolution) => {
        const request = trace.addressing.requests.find(
          ({ id }) => id === resolution.requestMessageId,
        )
        return (
          <div className="trace-record" key={resolution.requestMessageId}>
            <strong>
              {resolution.outcome === 'answered' ? 'Answered' : 'Ignored'}
            </strong>
            {request ? <p>{request.text}</p> : null}
            <span>{resolution.reason}</span>
          </div>
        )
      })}
    </div>
  )
}
