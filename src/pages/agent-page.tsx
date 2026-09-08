import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AgentMemoryPanel } from '../components/agent-memory'
import { AgentProgress } from '../components/agent-progress'
import { Icon } from '../components/icon'
import { ReplyComposer } from '../components/reply-composer'
import { AGENT_GUIDE } from '../preview/agent-example'
import { usePreview } from '../preview/provider'
import {
  type AgentConversation,
  type AgentMemoryEvent,
  isAgentBusy,
  isUnaddressed,
  type PostChange,
  type PostFieldChange,
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
    if (!element || agent.messages.length === previousCount.current) return
    const latest = agent.messages.at(-1)
    const userSent = latest?.sender === 'user'
    if (nearBottom.current || userSent || previousCount.current === 0) {
      element.scrollTop = element.scrollHeight
      setNewBelow(false)
    } else {
      setNewBelow(true)
    }
    previousCount.current = agent.messages.length
  }, [agent.messages])
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
        {messages.map((message) => (
          <article
            key={message.id}
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
              <span className={`candidate-context ${message.candidate.status}`}>
                {message.candidate.name} ·{' '}
                {message.candidate.status === 'clarification'
                  ? 'details needed'
                  : message.candidate.status}
              </span>
            ) : null}
            <MessageState message={message} />
            <p className="chat-bubble">{message.text}</p>
            {message.source ? (
              <TelegramSourceDisclosure
                source={message.source}
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
          </article>
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
        {agent.run ? (
          <AgentProgress run={agent.run} expanded={guide?.revealProgress} />
        ) : null}
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

function TelegramSourceDisclosure({
  source,
  open,
}: {
  source: NonNullable<AgentConversation['messages'][number]['source']>
  open: boolean
}) {
  return (
    <details className="telegram-source" open={open}>
      <summary>Source Telegram messages</summary>
      <p className="telegram-source-disclosure">{source.disclosure}</p>
      <p className="telegram-source-batch">
        Batch {source.batchId} · group {source.groupId}
      </p>
      <ol>
        {source.messages.map((message) => (
          <li key={message.id}>
            <span>
              <strong>{message.authorId ?? 'unknown'}</strong> · #{message.id}
              {message.replyToId ? ` · reply to #${message.replyToId}` : ''}
            </span>
            <p>{message.text}</p>
          </li>
        ))}
      </ol>
      <div className="telegram-source-outcomes">
        {source.outcomes.posts.map((post) => (
          <p key={`${post.authorId}:${post.title}`}>
            <strong>{post.authorId}</strong> · {post.outcome} “{post.title}” ·{' '}
            {post.questionCount} follow-up{' '}
            {post.questionCount === 1 ? 'question' : 'questions'}
          </p>
        ))}
        {source.outcomes.ignored.map((ignored) => (
          <p key={ignored.messageId}>
            <strong>#{ignored.messageId} ignored</strong> · {ignored.reason}
          </p>
        ))}
      </div>
    </details>
  )
}

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
