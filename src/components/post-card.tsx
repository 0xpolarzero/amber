import { Link } from '@tanstack/react-router'
import type { Post } from '../domain/post'
import { usePreview } from '../preview/provider'
import { PersonLink } from './avatar'
import { Icon } from './icon'

export function PostHeading({ post }: { post: Post }) {
  const { state, openDialog } = usePreview()
  return (
    <div className="post-heading">
      <PersonLink personId={post.author} />
      <div className="byline">
        <Link
          className="author-name"
          to="/people/$personId"
          params={{ personId: post.author }}
        >
          {state.people[post.author].name}
        </Link>
        <span className="byline-dot" />
        <span className="post-time">{post.time}</span>
      </div>
      <button
        type="button"
        className="icon-button"
        aria-label={`Options for ${post.title}`}
        onClick={() => openDialog({ kind: 'menu', postId: post.id })}
      >
        <Icon name="more" />
      </button>
    </div>
  )
}
export function ProjectLink({ post }: { post: Post }) {
  const { notify } = usePreview()
  return (
    <button
      type="button"
      className="project-link"
      aria-label={`Open ${post.project} project link`}
      onClick={() => notify('This sample project has no live link yet.')}
    >
      <span className="project-symbol">{post.mark}</span>
      <span className="project-info">
        <strong>{post.project}</strong>
        <span>{post.domain}</span>
      </span>
      <Icon name="arrow" />
    </button>
  )
}
export function OwnerPrompt({ post }: { post: Post }) {
  const { user, openDialog } = usePreview()
  return post.author === user && post.question ? (
    <button
      type="button"
      className="owner-prompt"
      onClick={() => openDialog({ kind: 'question', postId: post.id })}
    >
      <Icon name="spark" />
      <span>One detail would help. Add an answer.</span>
      <Icon name="chevron" />
    </button>
  ) : null
}
export function PostActions({ post }: { post: Post }) {
  const { saved, save, share } = usePreview()
  const count = post.comments.length
  return (
    <div className="actions">
      <Link
        className="quiet-action"
        to="/posts/$postId"
        params={{ postId: post.id }}
        hash="comments"
        aria-label={`${count} ${count === 1 ? 'comment' : 'comments'} on ${post.title}`}
      >
        <Icon name="comment" />
        <span>
          {count
            ? `${count} ${count === 1 ? 'comment' : 'comments'}`
            : 'Start a conversation'}
        </span>
      </Link>
      <span className="spacer" />
      <button
        type="button"
        className="share-button"
        aria-label={`Share ${post.title}`}
        onClick={() => share(post.id)}
      >
        <Icon name="share" />
      </button>
      <button
        type="button"
        className={`save-button ${saved.includes(post.id) ? 'saved' : ''}`}
        aria-label={`${saved.includes(post.id) ? 'Remove bookmark from' : 'Bookmark'} ${post.title}`}
        aria-pressed={saved.includes(post.id)}
        onClick={() => save(post.id)}
      >
        <Icon name="bookmark" />
      </button>
    </div>
  )
}
export function PostCard({
  post,
  owner = false,
}: {
  post: Post
  owner?: boolean
}) {
  const { openDialog } = usePreview()
  return (
    <article className="post" aria-label={post.title}>
      <PostHeading post={post} />
      <div className="post-content">
        <h2>
          <Link
            className="post-title"
            to="/posts/$postId"
            params={{ postId: post.id }}
          >
            {post.title}
          </Link>
        </h2>
        <p className="post-summary">{post.summary}</p>
        <ProjectLink post={post} />
        <OwnerPrompt post={post} />
        <PostActions post={post} />
        {owner && (
          <div className="owner-actions">
            <button
              type="button"
              onClick={() => openDialog({ kind: 'edit', postId: post.id })}
            >
              Edit post
            </button>
            <button
              type="button"
              onClick={() => openDialog({ kind: 'remove', postId: post.id })}
            >
              Remove
            </button>
          </div>
        )}
      </div>
    </article>
  )
}
