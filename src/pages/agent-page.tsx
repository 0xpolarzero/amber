import { Link, useNavigate } from '@tanstack/react-router'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AgentMemoryPanel } from '../components/agent-memory'
import { AgentProgress } from '../components/agent-progress'
import { Icon } from '../components/icon'
import { ReplyComposer } from '../components/reply-composer'
import { TraceCollection, TraceStep } from '../components/workflow-trace'
import { AGENT_GUIDE } from '../preview/agent-example'
import { usePreview } from '../preview/provider'
import {
  type AgentConversation,
  type AgentMemoryEvent,
  type AgentMessage,
  type AgentRun,
  isAgentBusy,
  isUnaddressed,
  type PostChange,
  type PostFieldChange,
  type TelegramSource,
  type WorkflowTrace,
} from '../preview/state'

export function AgentPage({ postId }: { postId?: string }) {
  const { state, user, agent, openDialog } = usePreview()
  if (user && agent)
    return (
      <AgentChat
        key={`${user}-${state.guideStep}-${state.scenarioRevision}`}
        user={user}
        agent={agent}
        postId={postId}
      />
    )
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name="spark" />
      </div>
      <h1>Your agent, just for you.</h1>
      <p>Talk to Amber about your posts and the way you like things done.</p>
      <button
        type="button"
        className="button"
        onClick={() => openDialog({ kind: 'signin' })}
      >
        Sign in
      </button>
    </div>
  )
}

function AgentChat({
  user,
  agent,
  postId,
}: {
  user: string
  agent: AgentConversation
  postId?: string
}) {
  const { state, dispatch } = usePreview()
  const navigate = useNavigate()
  const guide =
    state.guideStep === null ? undefined : AGENT_GUIDE[state.guideStep]
  const [activePanel, setActivePanel] = useState<'pending' | 'memory' | null>(
    guide?.revealMemory ? 'memory' : null,
  )
  const [pendingIndex, setPendingIndex] = useState(0)
  const [newBelow, setNewBelow] = useState(false)
  const history = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const previousCount = useRef(0)
  const injectedMessages =
    import.meta.env.VITE_AMBER_E2E === 'true' && typeof window !== 'undefined'
      ? (
          window as Window & {
            __amberTestMessages?: AgentConversation['messages']
          }
        ).__amberTestMessages
      : undefined
  const messages = injectedMessages
    ? [...agent.messages, ...injectedMessages]
    : agent.messages
  const responseId = agent.run?.outcome?.responseId
  const publishedResponse = responseId
    ? messages.find(({ id }) => id === responseId)
    : undefined
  const timelineMessages = responseId
    ? messages.filter(({ id }) => id !== responseId)
    : messages
  const hasReplySlot = Boolean(
    agent.run && timelineMessages.some(({ id }) => id === agent.run?.messageId),
  )
  const timelineCount = timelineMessages.length + (hasReplySlot ? 1 : 0)
  const pending = messages.filter(isUnaddressed)
  const context = [...state.posts, ...state.agentPosts].find(
    (post) => post.id === postId,
  )
  useEffect(() => {
    if (agent.messages.length > agent.readThrough)
      dispatch({ type: 'readAgent' })
  }, [agent.messages.length, agent.readThrough, dispatch])
  useLayoutEffect(() => {
    const element = history.current
    if (!element || timelineCount === previousCount.current) return
    const latest = agent.messages.at(-1)
    const userSent = latest?.sender === 'user'
    if (nearBottom.current || userSent || previousCount.current === 0) {
      element.scrollTop = element.scrollHeight
      setNewBelow(false)
    } else {
      setNewBelow(true)
    }
    previousCount.current = timelineCount
  }, [agent.messages, timelineCount])
  useLayoutEffect(() => {
    if (!guide?.targetMessageId) return
    const message = document.getElementById(`message-${guide.targetMessageId}`)
    message?.scrollIntoView({ block: 'start' })
    if (guide.focusMessage) message?.focus({ preventScroll: true })
  }, [guide])
  const focusPending = (index: number) => {
    const message = pending[index]
    if (!message) return
    setPendingIndex(index)
    const element = document.getElementById(`message-${message.id}`)
    element?.scrollIntoView({ block: 'center' })
    element?.focus({ preventScroll: true })
  }
  const openPending = () => {
    if (!pending.length) return
    if (activePanel === 'pending') {
      setActivePanel(null)
      return
    }
    setActivePanel('pending')
    requestAnimationFrame(() => focusPending(0))
  }
  const openMemory = () => {
    setActivePanel((current) => (current === 'memory' ? null : 'memory'))
  }
  const memoryPanelId = 'agent-memory-panel'
  const pendingPanelId = 'agent-pending-panel'
  return (
    <section
      className="conversation agent-chat"
      aria-label="Conversation with Amber"
    >
      {!agent.messages.length ? (
        <div className="agent-welcome">
          <h2>What would you like to work on?</h2>
          <p>Ask about a post, or tell me how you like things written.</p>
        </div>
      ) : null}
      <div
        className="conversation-history"
        ref={history}
        role="log"
        aria-label="Conversation history"
        aria-live="polite"
        aria-relevant="additions"
        onScroll={(event) => {
          const element = event.currentTarget
          nearBottom.current =
            element.scrollHeight - element.scrollTop - element.clientHeight < 72
          if (nearBottom.current) setNewBelow(false)
        }}
      >
        {timelineMessages.map((message) => (
          <Fragment key={message.id}>
            <article
              id={`message-${message.id}`}
              tabIndex={-1}
              aria-current={
                activePanel === 'pending' &&
                message.id === pending[pendingIndex]?.id
                  ? true
                  : undefined
              }
              className={`chat-message ${message.sender === 'user' ? 'outgoing' : ''} ${isUnaddressed(message) ? 'unaddressed' : ''}`}
            >
              {message.sender === 'amber' ? (
                <span className="chat-sender">Amber</span>
              ) : null}
              {message.postId && !message.changes?.length ? (
                <PostReference postId={message.postId} />
              ) : null}
              {message.candidate ? (
                <span
                  className={`candidate-context ${message.candidate.status}`}
                >
                  {message.candidate.name} ·{' '}
                  {message.candidate.status === 'clarification'
                    ? 'details needed'
                    : message.candidate.status}
                </span>
              ) : null}
              <MessageState message={message} />
              <p className="chat-bubble">{message.text}</p>
              {message.source && message.trace ? (
                <WorkflowTraceDisclosure
                  source={message.source}
                  trace={message.trace}
                  open={
                    Boolean(guide?.revealSource) &&
                    message.id === guide?.targetMessageId
                  }
                />
              ) : null}
              {message.changes?.length ? (
                <AppliedChanges
                  changes={message.changes}
                  expandedPostId={
                    message.id === guide?.targetMessageId
                      ? guide.expandedChangePostId
                      : undefined
                  }
                />
              ) : null}
              {reit(message.memoryEvents) ? (
                <MemoryReceipt
                  events={message.memoryEvents ?? []}
                  onOpen={() => setActivePanel('memory')}
                />
              ) : null}
              {message.usedMemories?.length || message.usedHistory?.length ? (
                <details
                  className="context-used"
                  open={
                    guide?.revealContext && message.id === guide.targetMessageId
                  }
                >
                  <summary>Context used</summary>
                  {message.usedMemories?.map((memory) => (
                    <p key={memory.id}>
                      <strong>Preference</strong>
                      {memory.text}
                    </p>
                  ))}
                  {message.usedHistory?.map((text) => (
                    <p key={text}>
                      <strong>Earlier message</strong>
                      {text}
                    </p>
                  ))}
                </details>
              ) : null}
              {message.replyRun ? (
                <AgentProgress run={message.replyRun} />
              ) : null}
            </article>
            {agent.run?.messageId === message.id ? (
              <ReplySlot
                key={`reply-${agent.run.messageId}`}
                run={agent.run}
                response={publishedResponse}
                expanded={Boolean(guide?.revealProgress)}
                expandedPostId={
                  guide?.targetMessageId === responseId
                    ? guide?.expandedChangePostId
                    : undefined
                }
                onOpenMemory={() => setActivePanel('memory')}
              />
            ) : null}
          </Fragment>
        ))}
      </div>
      {newBelow ? (
        <button
          className="new-message-jump"
          type="button"
          onClick={() => {
            if (history.current)
              history.current.scrollTop = history.current.scrollHeight
            nearBottom.current = true
            setNewBelow(false)
          }}
        >
          New message ↓
        </button>
      ) : null}
      <div className="conversation-footer">
        {postId ? (
          <div className="agent-post-context">
            {context ? (
              <Link to="/posts/$postId" params={{ postId: context.id }}>
                About {context.project}
              </Link>
            ) : (
              <span>About an unavailable post</span>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Remove post context"
              onClick={() =>
                void navigate({
                  to: '/agent',
                  search: {},
                  replace: true,
                  resetScroll: false,
                })
              }
            >
              <Icon name="close" />
            </button>
          </div>
        ) : null}
        {activePanel === 'pending' ? (
          <section
            className="composer-panel pending-panel"
            id={pendingPanelId}
            aria-label="Pending requests"
          >
            <span>Pending requests</span>
            <output aria-live="polite">
              {pending.length
                ? `${pendingIndex + 1} of ${pending.length}`
                : 'None'}
            </output>
            <div className="pending-panel-actions">
              <button
                type="button"
                aria-label="Previous pending message"
                title="Previous pending message"
                disabled={pendingIndex === 0}
                onClick={() => focusPending(pendingIndex - 1)}
              >
                <Icon name="chevron" />
              </button>
              <button
                type="button"
                aria-label="Next pending message"
                title="Next pending message"
                disabled={pendingIndex >= pending.length - 1}
                onClick={() => focusPending(pendingIndex + 1)}
              >
                <Icon name="chevron" />
              </button>
            </div>
          </section>
        ) : null}
        {activePanel === 'memory' ? (
          <AgentMemoryPanel id={memoryPanelId} />
        ) : null}
        <div className="composer-row">
          <ReplyComposer
            key={`${user}-${state.scenarioRevision}-${agent.revision}`}
            postId={context?.id}
            draft={agent.draft}
            blocked={isAgentBusy(agent.run)}
          />
          <div
            className="composer-tools"
            role="toolbar"
            aria-label="Conversation tools"
          >
            <button
              type="button"
              className="composer-tool pending-tool"
              aria-label={
                pending.length
                  ? `${activePanel === 'pending' ? 'Close' : 'Open'} pending messages (${pending.length})`
                  : 'No pending messages'
              }
              title={
                pending.length ? 'Pending messages' : 'No pending messages'
              }
              aria-controls={pendingPanelId}
              aria-expanded={activePanel === 'pending'}
              disabled={!pending.length}
              onClick={openPending}
            >
              <Icon name="flag" />
              <span className="pending-count" aria-hidden="true">
                {pending.length}
              </span>
            </button>
            <button
              type="button"
              className="composer-tool"
              aria-label={`${activePanel === 'memory' ? 'Close' : 'Open'} memory (${agent.memories.length} saved)`}
              title="Memory"
              aria-controls={memoryPanelId}
              aria-expanded={activePanel === 'memory'}
              onClick={openMemory}
            >
              <Icon name="memory" />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}

function ReplySlot({
  run,
  response,
  expanded,
  expandedPostId,
  onOpenMemory,
}: {
  run: AgentRun
  response?: AgentMessage
  expanded: boolean
  expandedPostId?: string
  onOpenMemory: () => void
}) {
  return (
    <article
      id={`message-${run.outcome?.responseId ?? `reply-${run.messageId}`}`}
      className="chat-message reply-slot"
      aria-label="Amber reply"
      tabIndex={-1}
    >
      <span className="chat-sender">Amber</span>
      {response ? <p className="chat-bubble">{response.text}</p> : null}
      <AgentProgress run={run} expanded={expanded} />
      {response?.changes?.length ? (
        <AppliedChanges
          changes={response.changes}
          expandedPostId={expandedPostId}
        />
      ) : null}
      {reit(response?.memoryEvents) ? (
        <MemoryReceipt
          events={response?.memoryEvents ?? []}
          onOpen={onOpenMemory}
        />
      ) : null}
      {response?.usedMemories?.length || response?.usedHistory?.length ? (
        <details className="context-used">
          <summary>Context used</summary>
          {response.usedMemories?.map((memory) => (
            <p key={memory.id}>
              <strong>Preference</strong>
              {memory.text}
            </p>
          ))}
          {response.usedHistory?.map((text) => (
            <p key={text}>
              <strong>Earlier message</strong>
              {text}
            </p>
          ))}
        </details>
      ) : null}
    </article>
  )
}

function WorkflowTraceDisclosure({
  source,
  trace,
  open,
}: {
  source: TelegramSource
  trace: WorkflowTrace
  open: boolean
}) {
  const selected = messagesById(source, trace.selectedMessageIds)
  const author = personName(trace.authorId)
  const existingCount = trace.context.existingPosts.length
  const memoryCount = trace.context.memories.length
  const outstandingCount = trace.context.outstandingRequests.length
  return (
    <details className="workflow-trace extraction-workflow-trace" open={open}>
      <summary aria-label="From Telegram">
        <span className="workflow-trace-toggle-icons">
          <Icon name="telegram" />
          <Icon name="chevronDown" className="workflow-trace-caret" />
        </span>
        <span>From Telegram</span>
        <span className="workflow-trace-count">4 steps</span>
      </summary>
      <div className="workflow-trace-content">
        <ol className="workflow-trace-steps">
          <TraceStep
            number={1}
            title="Shared Telegram work selected"
            summary={`${selected.length} messages grouped as ${author}’s ${trace.project} work.`}
          >
            <EvidenceMessages messages={selected} />
            {source.outcomes.ignored.length ? (
              <details className="trace-nested">
                <summary>
                  {source.outcomes.ignored.length} unrelated message ignored
                </summary>
                {source.outcomes.ignored.map((ignored) => {
                  const message = source.messages.find(
                    ({ id }) => id === ignored.messageId,
                  )
                  return (
                    <div className="trace-record" key={ignored.messageId}>
                      <strong>#{ignored.messageId}</strong>
                      {message ? <p>{message.text}</p> : null}
                      <span>{ignored.reason}</span>
                    </div>
                  )
                })}
              </details>
            ) : null}
          </TraceStep>
          <TraceStep
            number={2}
            title="Relevant context considered"
            summary={`${countLabel(existingCount, 'existing post')}, ${countLabel(memoryCount, 'saved preference')}, ${countLabel(outstandingCount, 'outstanding request')} supplied.`}
          >
            <TraceCollection
              title="Existing posts"
              empty="No existing Noted post was supplied to this writer branch."
              items={trace.context.existingPosts.map((post) => ({
                id: post.id,
                title: post.title,
                text: post.summary,
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
              title="Outstanding requests"
              empty="No earlier outstanding requests were supplied."
              items={trace.context.outstandingRequests.map((request) => ({
                id: request.id,
                title: request.intent,
                text: request.text,
              }))}
            />
            <div className="trace-tools">
              <strong>Recorded tool observations</strong>
              <p>
                {trace.context.observedTools.length
                  ? trace.context.observedTools.join(' · ')
                  : 'No tool calls were observed.'}
              </p>
              <span>
                The recording names observed tools across{' '}
                {trace.context.observationScope}. It does not retain their
                result payloads, so no fetch or search result is claimed here.
              </span>
            </div>
          </TraceStep>
          <TraceStep
            number={3}
            title="Accurate post published"
            summary={`${trace.publication.output.existingPostId ? 'Updated' : 'Created'} “${trace.publication.post.title}” from the supported details.`}
          >
            <div className="trace-post">
              <strong>{trace.publication.post.title}</strong>
              <p>{trace.publication.post.summary}</p>
              <p>{trace.publication.post.detail}</p>
              <span>
                Sources:{' '}
                {trace.publication.output.sources
                  .map(({ messageId }) => `#${messageId}`)
                  .join(', ')}
              </span>
            </div>
          </TraceStep>
          <TraceStep
            number={4}
            title="Unanswered fact asked"
            summary="Mandarin support was not stated in the selected messages."
          >
            <blockquote>{trace.question}</blockquote>
          </TraceStep>
        </ol>
        {trace.related.map((branch) => (
          <details className="trace-related" key={branch.authorId}>
            <summary>
              Same batch: {branch.project}
              <span>{branch.outcome}</span>
              <Icon name="chevronDown" />
            </summary>
            <EvidenceMessages
              messages={messagesById(source, branch.messageIds)}
            />
            {branch.existingPosts.map((post) => (
              <div className="trace-record" key={post.id}>
                <strong>Existing post: {post.title}</strong>
                <p>{post.summary}</p>
              </div>
            ))}
            <div className="trace-record">
              <strong>Result: {branch.resultPost.title}</strong>
              <p>{branch.resultPost.summary}</p>
            </div>
          </details>
        ))}
        <p className="trace-recording">
          {source.groupId} · {trace.recording.model}
        </p>
      </div>
    </details>
  )
}

function EvidenceMessages({
  messages,
}: {
  messages: TelegramSource['messages']
}) {
  return (
    <div className="trace-messages">
      {messages.map((message) => (
        <div className="trace-record" key={message.id}>
          <span>
            <strong>{personName(message.authorId)}</strong> · #{message.id}
            {message.replyToId ? ` · reply to #${message.replyToId}` : ''}
          </span>
          <p>{message.text}</p>
        </div>
      ))}
    </div>
  )
}

const messagesById = (source: TelegramSource, ids: readonly string[]) =>
  ids.flatMap((id) => source.messages.filter((message) => message.id === id))

const personName = (id: string | null) =>
  id ? `${id.charAt(0).toUpperCase()}${id.slice(1)}` : 'Unknown'

const countLabel = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? '' : 's'}`

function reit<T>(items: readonly T[] | undefined) {
  return Boolean(items?.length)
}

function MessageState({
  message,
}: {
  message: AgentConversation['messages'][number]
}) {
  if (message.resolution)
    return (
      <span className={`request-state ${message.resolution}`}>
        {message.resolution === 'answered' ? 'Answered' : 'Ignored'}
      </span>
    )
  if (isUnaddressed(message))
    return (
      <span className="unaddressed-label">
        {message.deferred ? 'Deferred' : 'Unanswered'}
      </span>
    )
  return null
}

function MemoryReceipt({
  events,
  onOpen,
}: {
  events: readonly AgentMemoryEvent[]
  onOpen: () => void
}) {
  return (
    <button type="button" className="memory-saved" onClick={onOpen}>
      <Icon name="check" />
      <span>
        <strong>
          {events.length === 1
            ? memoryEventLabel(events[0])
            : `${events.length} memory changes saved`}
        </strong>
        <span>{events.map(memoryEventText).join(' · ')}</span>
      </span>
    </button>
  )
}

const memoryEventLabel = (event: AgentMemoryEvent) =>
  event.kind === 'created'
    ? 'Preference created'
    : event.kind === 'replaced'
      ? 'Preference replaced'
      : 'Preference deleted'
const memoryEventText = (event: AgentMemoryEvent) =>
  event.after ?? event.before ?? ''

function PostReference({ postId }: { postId: string }) {
  const { state } = usePreview()
  const post = [...state.posts, ...state.agentPosts].find(
    (item) => item.id === postId,
  )
  if (!post)
    return <span className="agent-post-reference">Post unavailable</span>
  return (
    <Link
      className="agent-post-reference"
      aria-label={post.project}
      to="/posts/$postId"
      params={{ postId }}
    >
      <span className="project-symbol">{post.mark}</span>
      {post.project}
      <Icon name="chevron" />
    </Link>
  )
}

function AppliedChanges({
  changes,
  expandedPostId,
}: {
  changes: readonly PostChange[]
  expandedPostId?: string
}) {
  return (
    <section className="applied-changes" aria-label="Applied post changes">
      <p className="applied-summary">
        <Icon name="check" />
        {changes.length === 1
          ? changes[0].kind === 'created'
            ? '1 post created'
            : '1 post updated'
          : `${changes.length} posts changed`}
      </p>
      {changes.map((change) => (
        <PostChangeDiff
          key={change.postId}
          change={change}
          expanded={change.postId === expandedPostId}
        />
      ))}
    </section>
  )
}

function PostChangeDiff({
  change,
  expanded,
}: {
  change: PostChange
  expanded: boolean
}) {
  const { state } = usePreview()
  const post = [...state.posts, ...state.agentPosts].find(
    (item) => item.id === change.postId,
  )
  return (
    <details className="post-update" open={expanded}>
      <summary>
        <span>
          {change.kind === 'created' ? 'Created' : 'Updated'} {change.project}
        </span>
        <span className="post-version">v{change.toVersion}</span>
        <Icon name="chevronDown" />
      </summary>
      <section aria-label={`Changes to ${change.project}`}>
        <div className="post-update-header">
          <span>
            {change.fields.length}{' '}
            {change.fields.length === 1 ? 'field' : 'fields'}
          </span>
          {post ? (
            <Link
              to="/posts/$postId"
              params={{ postId: post.id }}
              aria-label={`View ${change.project} post`}
            >
              View post
              <Icon name="chevron" />
            </Link>
          ) : null}
        </div>
        {change.fields.map((field) => (
          <FieldDiff
            key={field.field}
            field={field}
            created={change.kind === 'created'}
          />
        ))}
      </section>
    </details>
  )
}

function FieldDiff({
  field,
  created,
}: {
  field: PostFieldChange
  created: boolean
}) {
  const label =
    field.field === 'detail'
      ? 'Details'
      : field.field === 'summary'
        ? 'Summary'
        : 'Title'
  return (
    <div className="field-diff">
      <h2>{label}</h2>
      {!created ? (
        <div className="diff-line removed">
          <span aria-hidden="true">−</span>
          <span className="visually-hidden">Removed: </span>
          <del>{field.before}</del>
        </div>
      ) : null}
      <div className="diff-line added">
        <span aria-hidden="true">+</span>
        <span className="visually-hidden">Added: </span>
        <ins>{field.after}</ins>
      </div>
    </div>
  )
}
