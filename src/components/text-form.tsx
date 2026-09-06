import { useForm } from '@tanstack/react-form'
import { useId } from 'react'
import { AnswerForm, CommentForm } from '../domain/forms'

export function TextForm({
  kind,
  initial = '',
  onSubmit,
}: {
  kind: 'comment' | 'answer'
  initial?: string
  onSubmit: (text: string) => void
}) {
  const inputId = useId()
  const form = useForm({
    defaultValues: { text: initial },
    validators: { onChange: kind === 'comment' ? CommentForm : AnswerForm },
    onSubmit: ({ value, formApi }) => {
      onSubmit(value.text.trim())
      if (kind === 'comment') formApi.reset()
    },
  })
  return (
    <form
      className={kind === 'comment' ? 'compose-body' : ''}
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="text">
        {(field) => (
          <div className={kind === 'answer' ? 'form-field' : ''}>
            <label
              className={kind === 'comment' ? 'visually-hidden' : 'field-label'}
              htmlFor={inputId}
            >
              {kind === 'comment' ? 'Your comment' : 'Your answer'}
            </label>
            <textarea
              className="edit-field"
              id={inputId}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              placeholder={
                kind === 'comment'
                  ? 'Ask a question. Share a thought.'
                  : 'A sentence or two is plenty.'
              }
              maxLength={kind === 'comment' ? 2000 : 1000}
              rows={3}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={
                field.state.meta.errors.length ? `${inputId}-error` : undefined
              }
            />
            {field.state.meta.errors.length > 0 && (
              <p id={`${inputId}-error`} className="field-error">
                Add a little text before continuing.
              </p>
            )}
          </div>
        )}
      </form.Field>
      <div className="compose-footer">
        <small>
          {kind === 'comment'
            ? 'Be curious. Be kind.'
            : 'Only you can publish the update.'}
        </small>
        <form.Subscribe
          selector={(state) =>
            [state.canSubmit, state.isSubmitting, state.values.text] as const
          }
        >
          {([canSubmit, submitting, text]) => (
            <button
              type="submit"
              className="button"
              disabled={!canSubmit || submitting || !text.trim()}
            >
              {kind === 'comment' ? 'Post comment' : 'Review update'}
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
