import { Link, useNavigate } from '@tanstack/react-router'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AgentMemoryDialog } from '../components/agent-memory'
import { Icon } from '../components/icon'
import { ReplyComposer } from '../components/reply-composer'
import { usePreview } from '../preview/provider'
import {
  type AgentConversation,
  isUnaddressed,
  type PostUpdate,
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
  const history = useRef<HTMLDivElement>(null)
  const unaddressed = agent.messages.filter(isUnaddressed)
  const context = state.posts.find((post) => post.id === postId)
  useEffect(() => {
    if (agent.messages.length > agent.readThrough)
      dispatch({ type: 'readAgent' })
  }, [agent.messages.length, agent.readThrough, dispatch])
  useLayoutEffect(() => {
    if (agent.messages.length && history.current)
      history.current.scrollTop = history.current.scrollHeight
  }, [agent.messages.length])
  const lastUpdateId = agent.messages
    .filter((message) => message.update)
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
          <p>Your agent, across your posts.</p>
        </div>
        {unaddressed.length > 0 && (
          <button
            className="unaddressed-jump"
            type="button"
            onClick={() => {
              const message = document.getElementById(
                `message-${unaddressed[0].id}`,
              )
              message?.scrollIntoView({ block: 'center' })
              message?.focus({ preventScroll: true })
            }}
          >
            {unaddressed.length} unaddressed
          </button>
        )}
        <button
          className="memory-button"
          type="button"
          onClick={() => setMemoryOpen(true)}
        >
          Memory<span>{agent.memories.length}</span>
        </button>
      </header>
      {!agent.messages.length && (
        <div className="agent-welcome">
          <h2>What would you like to work on?</h2>
          <p>Ask about a post, or tell me how you like things written.</p>
        </div>
      )}
      <div
        className="conversation-history"
        ref={history}
        role="log"
        aria-label="Conversation history"
        aria-relevant="additions"
      >
        {agent.messages.map((message) => (
          <div
            key={message.id}
            id={`message-${message.id}`}
            tabIndex={-1}
            className={`chat-message ${message.sender === 'user' ? 'outgoing' : ''} ${isUnaddressed(message) ? 'unaddressed' : ''}`}
          >
            <span className="chat-sender">
              {message.sender === 'amber' ? 'Amber' : state.people[user].name}
            </span>
            {message.postId && !message.update && (
              <PostReference postId={message.postId} />
            )}
            {isUnaddressed(message) && (
              <span className="unaddressed-label">Unaddressed</span>
            )}
            <p className="chat-bubble">{message.text}</p>
            {message.memorySaved && (
              <button
                type="button"
                className="memory-saved"
                onClick={() => setMemoryOpen(true)}
              >
                <Icon name="check" />
                <span>
                  <strong>
                    {agent.memories.some(
                      (memory) => memory.id === message.memorySaved?.id,
                    )
                      ? 'Saved to memory'
                      : 'Memory forgotten'}
                  </strong>
                  <span>{message.memorySaved.text}</span>
                </span>
              </button>
            )}
            {message.update && message.postId && (
              <PostUpdateDiff
                postId={message.postId}
                update={message.update}
                expanded={message.id === lastUpdateId}
              />
            )}
            {Boolean(message.usedMemories?.length) && (
              <details className="memory-used">
                <summary>
                  Used {message.usedMemories?.length} saved preference
                </summary>
                {message.usedMemories?.map((memory) => (
                  <p key={memory.id}>{memory.text}</p>
                ))}
              </details>
            )}
          </div>
        ))}
      </div>
      <div className="conversation-footer">
        {postId && (
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
        )}
        <ReplyComposer postId={context?.id} draft={agent.draft} />
      </div>
      {memoryOpen && <AgentMemoryDialog onClose={() => setMemoryOpen(false)} />}
    </section>
  )
}

function PostReference({ postId }: { postId: string }) {
  const { state } = usePreview()
  const post = state.posts.find((post) => post.id === postId)
  if (!post) return <span className="agent-post-reference">Post removed</span>
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

function PostUpdateDiff({
  postId,
  update,
  expanded,
}: {
  postId: string
  update: PostUpdate
  expanded: boolean
}) {
  const { state } = usePreview()
  const post = state.posts.find((post) => post.id === postId)
  const field =
    update.field === 'detail'
      ? 'Details'
      : update.field === 'summary'
        ? 'Summary'
        : 'Title'
  return (
    <details className="post-update" open={expanded}>
      <summary>
        <Icon name="check" />
        <span>Updated {post?.project ?? 'removed post'}</span>
        <Icon name="chevronDown" />
      </summary>
      <section
        aria-label={`Changes to ${post?.project ?? 'removed post'} ${field.toLowerCase()}`}
      >
        <div className="post-update-header">
          <h2>{field}</h2>
          {post && (
            <Link
              to="/posts/$postId"
              params={{ postId }}
              aria-label={`View ${post.project} post`}
            >
              View post
              <Icon name="chevron" />
            </Link>
          )}
        </div>
        <div className="diff-line removed">
          <span aria-hidden="true">−</span>
          <span className="visually-hidden">Removed: </span>
          <del>{update.before}</del>
        </div>
        <div className="diff-line added">
          <span aria-hidden="true">+</span>
          <span className="visually-hidden">Added: </span>
          <ins>{update.after}</ins>
        </div>
      </section>
    </details>
  )
}
