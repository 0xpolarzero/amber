import { Link } from '@tanstack/react-router'
import { Avatar, PersonLink } from '../components/avatar'
import { BackLink } from '../components/back-link'
import { EmptyState } from '../components/empty-state'
import { Icon } from '../components/icon'
import {
  OwnerPrompt,
  PostActions,
  PostHeading,
  ProjectLink,
} from '../components/post-card'
import { TextForm } from '../components/text-form'
import { usePreview } from '../preview/provider'

export function PostPage({ postId }: { postId: string }) {
  const { state, user, dispatch, openDialog, notify } = usePreview()
  const post = state.posts.find((post) => post.id === postId)
  if (!post)
    return (
      <EmptyState title="This post is no longer here.">
        Return to the feed to find another project.
      </EmptyState>
    )
  return (
    <>
      <BackLink title="Post" />
      <article className="detail-post" aria-label={post.title}>
        <PostHeading post={post} />
        <div className="post-content">
          <h1 className="post-title">{post.title}</h1>
          <p className="post-summary">{post.summary}</p>
          {post.detail
            .split('\n\n')
            .filter(Boolean)
            .map((paragraph) => (
              <p key={paragraph} className="post-summary">
                {paragraph}
              </p>
            ))}
          <ProjectLink post={post} />
          <OwnerPrompt post={post} />
          <div className="post-provenance">
            <button
              type="button"
              onClick={() =>
                notify('Sample content. No Telegram message is connected yet.')
              }
            >
              View original message
            </button>
          </div>
          <PostActions post={post} />
        </div>
      </article>
      <section
        className="comments"
        id="comments"
        aria-labelledby="comments-title"
      >
        <h2 className="comments-heading" id="comments-title">
          Conversation <span>{post.comments.length}</span>
        </h2>
        {user ? (
          <div className="composer">
            <Avatar personId={user} />
            <TextForm
              key={`${post.id}-${user}`}
              onSubmit={(text) => {
                dispatch({
                  type: 'comment',
                  postId,
                  id: crypto.randomUUID(),
                  text,
                })
                notify('Comment added.')
              }}
            />
          </div>
        ) : (
          <div className="signin-prompt">
            <span>A good question goes a long way.</span>
            <button
              type="button"
              className="button secondary"
              onClick={() => openDialog({ kind: 'signin' })}
            >
              Sign in to comment
            </button>
          </div>
        )}
        {post.comments.map((comment) => (
          <article className="comment" key={comment.id}>
            <PersonLink personId={comment.author} />
            <div className="comment-body">
              <div className="byline">
                <Link
                  className="author-name"
                  to="/people/$personId"
                  params={{ personId: comment.author }}
                >
                  {state.people[comment.author].name}
                </Link>
                <span className="byline-dot" />
                <span className="post-time">{comment.time}</span>
              </div>
              <p>{comment.text}</p>
            </div>
            {comment.author === user && (
              <button
                type="button"
                className="icon-button"
                aria-label={`Delete your comment: ${comment.text}`}
                onClick={() => {
                  dispatch({
                    type: 'deleteComment',
                    postId,
                    commentId: comment.id,
                  })
                  notify('Comment removed.')
                }}
              >
                <Icon name="trash" />
              </button>
            )}
          </article>
        ))}
      </section>
    </>
  )
}
