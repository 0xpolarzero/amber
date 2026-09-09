import { Link } from '@tanstack/react-router'
import { usePreview } from '../preview/provider'
import type { PostChange, PostFieldChange } from '../preview/state'
import { Icon } from './icon'

export function PostChangeDiff({
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
        <span>{change.project}</span>
        {change.kind === 'created' ? (
          <span className="post-created-label">New</span>
        ) : null}
        <Icon name="chevronDown" />
      </summary>
      <section aria-label={`Changes to ${change.project}`}>
        {change.fields.map((field) => (
          <FieldDiff
            key={field.field}
            field={field}
            created={change.kind === 'created'}
          />
        ))}
        {post ? (
          <Link
            className="post-diff-link"
            to="/posts/$postId"
            params={{ postId: post.id }}
            aria-label={`View ${change.project} post`}
          >
            View post <Icon name="chevron" />
          </Link>
        ) : null}
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
