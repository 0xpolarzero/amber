import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { usePreview } from '../preview/provider'

export function MessagesPage() {
  const { state, user, messages, readQuestions } = usePreview()
  return (
    <>
      <header className="feed-header">
        <h1>Messages</h1>
      </header>
      {!user ? (
        <MessagesSignIn />
      ) : messages.length ? (
        <div className="message-list">
          {messages.map((post) => {
            const conversation = state.conversations[post.id]
            const unread = Boolean(
              post.question && !readQuestions.includes(post.id),
            )
            return (
              <Link
                key={post.id}
                className={`message-row ${unread ? 'unread' : ''}`}
                to="/messages/$postId"
                params={{ postId: post.id }}
              >
                <span className="message-avatar">
                  <Icon name="spark" />
                </span>
                <span className="message-body">
                  <span className="message-byline">
                    <strong>Amber</strong>
                    <span>About {post.project}</span>
                    {unread && (
                      <span
                        className="unread-dot"
                        role="img"
                        aria-label="Unread"
                      />
                    )}
                  </span>
                  <span className="message-subject">{post.title}</span>
                  <span className="message-preview">
                    {conversation.draft ||
                      conversation.answer ||
                      conversation.question}
                  </span>
                  <span className="message-status">
                    {conversation.draft
                      ? 'Draft'
                      : conversation.answer
                        ? 'Post updated'
                        : 'Reply needed'}
                  </span>
                </span>
                <Icon name="chevron" />
              </Link>
            )
          })}
          <p className="messages-note">
            Private conversations about your posts.
          </p>
        </div>
      ) : (
        <EmptyState title="All quiet here." icon="comment">
          When Amber needs a detail about something you shared, you’ll find the
          question here.
        </EmptyState>
      )}
    </>
  )
}

export function MessagesSignIn() {
  const { openDialog } = usePreview()
  return (
    <div className="empty">
      <div className="empty-icon">
        <Icon name="comment" />
      </div>
      <h2>Your messages stay with you.</h2>
      <p>Sign in to answer private questions about your projects.</p>
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

import { Link } from '@tanstack/react-router'
