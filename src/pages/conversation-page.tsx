import { Link } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { ReplyComposer } from '../components/reply-composer'
import type { Post } from '../domain/post'
import { usePreview } from '../preview/provider'
import type { PreviewConversation } from '../preview/state'
import { MessagesSignIn } from './messages-page'

export function ConversationPage({ postId }: { postId: string }) {
  const { state, user, dispatch } = usePreview()
  const post = state.posts.find(
    (post) => post.id === postId && post.author === user,
  )
  const conversation = post ? state.conversations[post.id] : undefined
  const available = Boolean(conversation)
  useEffect(() => {
    if (user && available) dispatch({ type: 'readQuestion', postId })
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
  const { state, dispatch } = usePreview()
  const [review, setReview] = useState<{
    text: string
    baseDetail: string
  } | null>(null)
  const [focusReply, setFocusReply] = useState(false)
  const reviewHeading = useRef<HTMLHeadingElement>(null)
  const completed = useRef<HTMLParagraphElement>(null)
  const stale = review !== null && review.baseDetail !== post.detail
  useEffect(() => {
    if (review && !conversation.answer) {
      reviewHeading.current?.focus({ preventScroll: true })
      reviewHeading.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'instant',
      })
    }
  }, [review, conversation.answer])
  useEffect(() => {
    if (review && conversation.answer) {
      completed.current?.focus({ preventScroll: true })
      completed.current?.scrollIntoView({
        block: 'nearest',
        behavior: 'instant',
      })
    }
  }, [review, conversation.answer])

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
        <div className="chat-message">
          <span className="chat-sender">Amber</span>
          <p className="chat-bubble">{conversation.question}</p>
        </div>
        {conversation.answer && (
          <div className="chat-message outgoing">
            <span className="chat-sender">
              {state.people[post.author].name}
            </span>
            <p className="chat-bubble">{conversation.answer}</p>
          </div>
        )}
      </div>
      <div className="conversation-footer">
        {conversation.answer ? (
          <p className="conversation-complete" tabIndex={-1} ref={completed}>
            <Icon name="check" />
            <span>Post updated</span>
            <Link to="/posts/$postId" params={{ postId: post.id }}>
              View post
              <Icon name="chevron" />
            </Link>
          </p>
        ) : review ? (
          <section
            className="reply-review"
            aria-labelledby="reply-review-title"
          >
            <h2 id="reply-review-title" ref={reviewHeading} tabIndex={-1}>
              Review post update
            </h2>
            <p>This paragraph will be added to your post.</p>
            <blockquote>{review.text}</blockquote>
            <details className="review-current-post">
              <summary>Current post</summary>
              <p>{post.summary}</p>
              <p>{post.detail}</p>
            </details>
            {stale && (
              <p className="field-error" role="alert">
                The post changed. Edit your reply and review the latest version.
              </p>
            )}
            <div className="reply-review-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => {
                  setFocusReply(true)
                  setReview(null)
                }}
              >
                Edit reply
              </button>
              <button
                type="button"
                className="button"
                disabled={stale}
                onClick={() =>
                  dispatch({ type: 'answer', postId: post.id, ...review })
                }
              >
                Accept update
              </button>
            </div>
          </section>
        ) : (
          <ReplyComposer
            postId={post.id}
            draft={conversation.draft}
            focusOnMount={focusReply}
            onReview={(text) => setReview({ text, baseDetail: post.detail })}
          />
        )}
      </div>
    </section>
  )
}
