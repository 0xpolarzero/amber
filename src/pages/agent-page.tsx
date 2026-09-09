import { Link, useNavigate } from '@tanstack/react-router'
import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AgentMemoryPanel } from '../components/agent-memory'
import {
  AgentProgress,
  answerPreview,
  ChangeLinks,
} from '../components/agent-progress'
import { Icon } from '../components/icon'
import {
  QuestionWorkflowTrace,
  TelegramUpdateWorkflowTrace,
} from '../components/question-workflow-trace'
import { ReplyComposer } from '../components/reply-composer'
import { usePreview } from '../preview/provider'
import {
  type AgentConversation,
  type AgentMessage,
  type AgentRun,
  isAgentBusy,
  isUnaddressed,
} from '../preview/state'

export function AgentPage({ postId }: { postId?: string }) {
  const { state, user, agent, openDialog } = usePreview()
  if (user && agent)
    return (
      <AgentChat
        key={`${user}-${state.scenarioRevision}`}
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
  const [activePanel, setActivePanel] = useState<'pending' | 'memory' | null>(
    null,
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
      element.scrollTop =
        state.scenarioId === 'question-example' && previousCount.current === 0
          ? 0
          : element.scrollHeight
      setNewBelow(false)
    } else {
      setNewBelow(true)
    }
    previousCount.current = timelineCount
  }, [agent.messages, timelineCount, state.scenarioId])
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
                <QuestionWorkflowTrace
                  source={message.source}
                  trace={message.trace}
                  open={state.scenarioId === 'question-example'}
                />
              ) : null}
              {message.telegramUpdateTrace ? (
                <TelegramUpdateWorkflowTrace
                  trace={message.telegramUpdateTrace}
                />
              ) : null}
              {message.replyRun ? (
                <>
                  <ChangeLinks run={message.replyRun} />
                  <AgentProgress run={message.replyRun} />
                </>
              ) : null}
            </article>
            {agent.run?.messageId === message.id ? (
              <ReplySlot
                key={`reply-${agent.run.messageId}`}
                run={agent.run}
                response={publishedResponse}
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
}: {
  run: AgentRun
  response?: AgentMessage
}) {
  return (
    <article
      id={`message-${run.outcome?.responseId ?? `reply-${run.messageId}`}`}
      className="chat-message reply-slot"
      aria-label="Amber reply"
      tabIndex={-1}
    >
      <span className="chat-sender">Amber</span>
      {response || answerPreview(run) ? (
        <p className="chat-bubble" aria-busy={!run.published}>
          {response?.text ?? answerPreview(run)}
        </p>
      ) : null}
      <ChangeLinks run={run} />
      <AgentProgress run={run} />
    </article>
  )
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
