import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AgentMemoryDialog } from '../components/agent-memory'
import { AgentProgress } from '../components/agent-progress'
import { Icon } from '../components/icon'
import { ReplyComposer } from '../components/reply-composer'
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
  const { user, agent, openDialog } = usePreview()
  if (user && agent)
    return <AgentChat key={user} user={user} agent={agent} postId={postId} />
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
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [pendingIndex, setPendingIndex] = useState(-1)
  const [newBelow, setNewBelow] = useState(false)
  const history = useRef<HTMLDivElement>(null)
  const nearBottom = useRef(true)
  const previousCount = useRef(0)
  const pending = agent.messages.filter(isUnaddressed)
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
  const jumpToPending = (direction: 1 | -1) => {
    if (!pending.length) return
    const next = (pendingIndex + direction + pending.length) % pending.length
    setPendingIndex(next)
    const message = document.getElementById(`message-${pending[next].id}`)
    message?.scrollIntoView({ block: 'center' })
    message?.focus({ preventScroll: true })
  }
  const latestChangeMessage = agent.messages
    .filter((message) => message.changes?.length)
    .at(-1)?.id
  return (
    <section
      className="conversation agent-chat"
      aria-label="Conversation with Amber"
    >
      <header className="conversation-header agent-header">
        <span className="message-avatar">
          <Icon name="spark" />
        </span>
        <div>
          <h1>Amber</h1>
          <p>One private conversation across your posts.</p>
        </div>
        {pending.length > 0 ? (
          <fieldset className="pending-navigation">
            <legend className="visually-hidden">Pending requests</legend>
            <button
              type="button"
              onClick={() => jumpToPending(-1)}
              aria-label="Previous pending request"
            >
              <Icon name="chevron" />
            </button>
            <button
              className="unaddressed-jump"
              type="button"
              onClick={() => jumpToPending(1)}
              aria-label={`Next pending request (${pending.length} open)`}
            >
              {pending.length} pending
            </button>
            <button
              type="button"
              onClick={() => jumpToPending(1)}
              aria-label="Next pending request"
            >
              <Icon name="chevron" />
            </button>
          </fieldset>
        ) : null}
        <button
          className="memory-button"
          type="button"
          onClick={() => setMemoryOpen(true)}
        >
          Memory<span>{agent.memories.length}</span>
        </button>
      </header>
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
        {agent.messages.map((message) => (
          <article
            key={message.id}
            id={`message-${message.id}`}
            tabIndex={-1}
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
            {message.changes?.length ? (
              <AppliedChanges
                changes={message.changes}
                expanded={
                  message.id === latestChangeMessage &&
                  message.changes.length === 1
                }
              />
            ) : null}
            {reit(message.memoryEvents) ? (
              <MemoryReceipt
                events={message.memoryEvents ?? []}
                onOpen={() => setMemoryOpen(true)}
              />
            ) : null}
            {message.usedMemories?.length || message.usedHistory?.length ? (
              <details className="context-used">
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
        {agent.run ? <AgentProgress run={agent.run} /> : null}
        {postId ? (
          <div className="agent-post-context">
            <span>About {context?.project ?? 'an unavailable post'}</span>
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
        <ReplyComposer
          key={`${user}-${state.scenarioRevision}-${agent.revision}`}
          postId={context?.id}
          draft={agent.draft}
          blocked={isAgentBusy(agent.run)}
        />
      </div>
      {memoryOpen ? (
        <AgentMemoryDialog onClose={() => setMemoryOpen(false)} />
      ) : null}
    </section>
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
        {message.deferred ? 'Deferred · still open' : 'Needs your reply'}
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
  expanded,
}: {
  changes: readonly PostChange[]
  expanded: boolean
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
          expanded={expanded}
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
