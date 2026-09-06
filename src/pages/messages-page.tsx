import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import { usePreview } from '../preview/provider'

export function MessagesPage() {
  const { user, messages, readQuestions, openDialog } = usePreview()
  return (
    <>
      <header className="feed-header">
        <h1>Messages</h1>
        <p className="feed-subtitle">A little context, just between us.</p>
      </header>
      {!user ? (
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
      ) : messages.length ? (
        <div className="message-list">
          {messages.map((post) => {
            const unread = !readQuestions.includes(post.id)
            return (
              <button
                key={post.id}
                type="button"
                className={`message-row ${unread ? 'unread' : ''}`}
                onClick={() =>
                  openDialog({ kind: 'question', postId: post.id })
                }
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
                  <span className="message-preview">{post.question}</span>
                </span>
                <Icon name="chevron" />
              </button>
            )
          })}
          <p className="messages-note">
            Only you can see these questions. You review every update before it
            appears on your post.
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
