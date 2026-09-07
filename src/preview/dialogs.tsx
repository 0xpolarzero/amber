import { useForm } from '@tanstack/react-form'
import { useNavigate } from '@tanstack/react-router'
import { useId } from 'react'
import { Dialog } from '../components/dialog'
import { Icon } from '../components/icon'
import { EditPostForm } from '../domain/forms'
import type { Post } from '../domain/post'
import { usePreview } from './provider'

export function PreviewDialogs() {
  const {
    dialog,
    openDialog,
    dispatch,
    user,
    saved,
    save,
    share,
    state,
    notify,
  } = usePreview()
  const navigate = useNavigate()
  if (!dialog) return null
  const close = () => openDialog(null)
  if (dialog.kind === 'signin') {
    const signIn = () => {
      dispatch({ type: 'role', role: 'member' })
      if (
        dialog.savePostId &&
        !state.savedByUser.you?.includes(dialog.savePostId)
      )
        dispatch({ type: 'save', postId: dialog.savePostId })
      close()
      notify(
        dialog.savePostId
          ? 'Signed in to the preview. Post bookmarked.'
          : 'Signed in to the preview.',
      )
    }
    return (
      <Dialog title="A little closer to the group." onClose={close}>
        <p className="dialog-copy">
          Bookmark good finds, ask questions and make the conversation yours.
        </p>
        <div className="auth-options">
          <button type="button" className="auth-option" onClick={signIn}>
            <Icon name="telegram" />
            Continue with Telegram
          </button>
          <button type="button" className="auth-option" onClick={signIn}>
            <Icon name="x" />
            Continue with X
          </button>
        </div>
        <p className="dialog-footnote">
          Preview only. Both buttons open a sample account.
        </p>
      </Dialog>
    )
  }
  const post = state.posts.find((post) => post.id === dialog.postId)
  if (!post)
    return (
      <Dialog title="This post was removed." onClose={close}>
        <p className="dialog-copy">You can return to the feed.</p>
      </Dialog>
    )
  const owner = post.author === user
  if (dialog.kind === 'menu')
    return (
      <Dialog title={post.project} onClose={close}>
        <div className="menu-options">
          <button
            type="button"
            onClick={() => {
              close()
              save(post.id)
            }}
          >
            <Icon name="bookmark" />
            {saved.includes(post.id) ? 'Remove bookmark' : 'Bookmark'}
          </button>
          <button
            type="button"
            onClick={() => {
              close()
              void share(post.id)
            }}
          >
            <Icon name="link" />
            Copy link
          </button>
          <button
            type="button"
            onClick={() => {
              close()
              notify('Sample content. No Telegram message is connected yet.')
            }}
          >
            <Icon name="telegram" />
            View original message
          </button>
          {owner ? (
            <>
              <button
                type="button"
                onClick={() => openDialog({ kind: 'edit', postId: post.id })}
              >
                <Icon name="edit" />
                Edit post
              </button>
              <button
                type="button"
                onClick={() => openDialog({ kind: 'remove', postId: post.id })}
              >
                <Icon name="trash" />
                Remove post
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => {
                close()
                notify('Preview only. No report was sent.')
              }}
            >
              <Icon name="flag" />
              Report post
            </button>
          )}
        </div>
      </Dialog>
    )
  if (!owner)
    return (
      <Dialog title="This post belongs to its author." onClose={close}>
        <p className="dialog-copy">
          Switch to the Author preview account to edit Alex’s post.
        </p>
      </Dialog>
    )
  if (dialog.kind === 'edit')
    return (
      <Dialog title="Edit your post" onClose={close}>
        <EditForm key={post.id} post={post} onClose={close} />
      </Dialog>
    )
  return (
    <Dialog title="Remove this post?" onClose={close}>
      <p className="dialog-copy">
        The post and its comments will disappear from this preview. The original
        Telegram message stays yours.
      </p>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={close}>
          Keep post
        </button>
        <button
          type="button"
          className="button"
          onClick={() => {
            dispatch({ type: 'remove', postId: post.id })
            close()
            notify('Post removed from the preview.')
            void navigate({
              to: '/',
              search: { sort: 'latest', q: '', authors: ['me'] },
            })
          }}
        >
          Remove post
        </button>
      </div>
    </Dialog>
  )
}

function EditForm({ post, onClose }: { post: Post; onClose: () => void }) {
  const { dispatch, notify } = usePreview()
  const id = useId()
  const form = useForm({
    defaultValues: {
      title: post.title,
      summary: post.summary,
      detail: post.detail,
    },
    validators: { onChange: EditPostForm },
    onSubmit: ({ value }) => {
      dispatch({ type: 'edit', postId: post.id, ...value })
      onClose()
      notify('Your post is updated.')
    },
  })
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <p className="dialog-copy">Keep it simple. Make it sound right to you.</p>
      {(['title', 'summary', 'detail'] as const).map((name) => (
        <form.Field key={name} name={name}>
          {(field) => (
            <>
              <label className="field-label" htmlFor={`${id}-${name}`}>
                {name === 'detail'
                  ? 'More detail'
                  : name === 'title'
                    ? 'Title'
                    : 'Summary'}
              </label>
              <textarea
                className="edit-field"
                id={`${id}-${name}`}
                rows={name === 'title' ? 2 : 4}
                maxLength={
                  name === 'title' ? 140 : name === 'summary' ? 500 : 5000
                }
                value={field.state.value}
                onChange={(event) => field.handleChange(event.target.value)}
                onBlur={field.handleBlur}
                aria-invalid={field.state.meta.errors.length > 0}
                aria-describedby={
                  field.state.meta.errors.length
                    ? `${id}-${name}-error`
                    : undefined
                }
              />
              {field.state.meta.errors.length > 0 && (
                <p className="field-error" id={`${id}-${name}-error`}>
                  Keep this field within its limit; title and summary need text.
                </p>
              )}
            </>
          )}
        </form.Field>
      ))}
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onClose}>
          Cancel
        </button>
        <form.Subscribe
          selector={(state) => [state.canSubmit, state.isSubmitting] as const}
        >
          {([canSubmit, submitting]) => (
            <button
              type="submit"
              className="button"
              disabled={!canSubmit || submitting}
            >
              Save changes
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
