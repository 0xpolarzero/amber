import { Link } from '@tanstack/react-router'
import { useEffect, useRef } from 'react'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { ReplyComposer } from '../components/reply-composer'
import type { Post } from '../domain/post'
import { usePreview } from '../preview/provider'
import type { PostUpdate, PreviewConversation } from '../preview/state'
import { MessagesSignIn } from './messages-page'

export function ConversationPage({ postId }: { postId: string }) {
  const { state, user, dispatch } = usePreview()
  const post = state.posts.find(
    (post) => post.id === postId && post.author === user,
  )
  const conversation = post ? state.conversations[post.id] : undefined
  const available = Boolean(conversation)
  useEffect(() => {
    if (user && available) dispatch({ type: 'readConversation', postId })
  }, [user, postId, available, dispatch])

  if (post && conversation)
    return (
      <Conversation
        key={`${user}-${postId}`}
        post={post}
        conversation={conversation}
      />
    )
  return (
    <>
      <div className="detail-nav">
        <Link
          to="/messages"
          className="icon-button"
          aria-label="Back to messages"
        >
          <Icon name="back" />
        </Link>
        <span>Messages</span>
      </div>
      {!user ? (
        <MessagesSignIn />
      ) : (
        <EmptyState title="Conversation unavailable." icon="comment">
          Return to messages to see your conversations.
        </EmptyState>
      )}
    </>
  )
}

function Conversation({
  post,
  conversation,
}: {
  post: Post
  conversation: PreviewConversation
}) {
  const { state } = usePreview()
  const historyEnd = useRef<HTMLDivElement>(null)
  const previousCount = useRef(conversation.messages.length)
  useEffect(() => {
    if (conversation.messages.length > previousCount.current)
      historyEnd.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'instant',
      })
    previousCount.current = conversation.messages.length
  }, [conversation.messages.length])

  return (
    <section
      className="conversation"
      aria-label={`Conversation about ${post.project}`}
    >
      <header className="conversation-header">
        <Link
          to="/messages"
          className="icon-button"
          aria-label="Back to messages"
        >
          <Icon name="back" />
        </Link>
        <span className="message-avatar">
          <Icon name="spark" />
        </span>
        <div>
          <h1>Amber</h1>
          <p>Private conversation</p>
        </div>
      </header>
      <Link
        className="conversation-post"
        to="/posts/$postId"
        params={{ postId: post.id }}
      >
        <span className="project-symbol">{post.mark}</span>
        <span className="conversation-post-title">
          <small>{post.project}</small>
          <strong>{post.title}</strong>
        </span>
        <span className="conversation-post-action">View post</span>
        <Icon name="chevron" />
      </Link>
      <div
        className="conversation-history"
        role="log"
        aria-label="Conversation history"
        aria-relevant="additions"
      >
        {conversation.messages.map((message, index) => (
          <div
            key={message.id}
            ref={
              index === conversation.messages.length - 1
                ? historyEnd
                : undefined
            }
            className={`chat-message ${message.sender === 'author' ? 'outgoing' : ''}`}
          >
            <span className="chat-sender">
              {message.sender === 'amber'
                ? 'Amber'
                : state.people[post.author].name}
            </span>
            <p className="chat-bubble">{message.text}</p>
            {message.update && (
              <PostUpdateDiff postId={post.id} update={message.update} />
            )}
          </div>
        ))}
      </div>
      <div className="conversation-footer">
        <ReplyComposer postId={post.id} draft={conversation.draft} />
      </div>
    </section>
  )
}

function PostUpdateDiff({
  postId,
  update,
}: {
  postId: string
  update: PostUpdate
}) {
  const field =
    update.field === 'detail'
      ? 'Details'
      : update.field === 'summary'
        ? 'Summary'
        : 'Title'
  return (
    <section
      className="post-update"
      aria-label={`Changes to ${field.toLowerCase()}`}
    >
      <div className="post-update-header">
        <Icon name="check" />
        <span>Post updated</span>
        <Link to="/posts/$postId" params={{ postId }}>
          View post
          <Icon name="chevron" />
        </Link>
      </div>
      <h2>{field}</h2>
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
  )
}
