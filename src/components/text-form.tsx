import { useForm } from '@tanstack/react-form'
import { useId } from 'react'
import { CommentForm } from '../domain/forms'

export function TextForm({ onSubmit }: { onSubmit: (text: string) => void }) {
  const inputId = useId()
  const form = useForm({
    defaultValues: { text: '' },
    validators: { onChange: CommentForm },
    onSubmit: ({ value, formApi }) => {
      onSubmit(value.text.trim())
      formApi.reset()
    },
  })
  return (
    <form
      className="compose-body"
      onSubmit={(event) => {
        event.preventDefault()
        event.stopPropagation()
        void form.handleSubmit()
      }}
    >
      <form.Field name="text">
        {(field) => (
          <div>
            <label className="visually-hidden" htmlFor={inputId}>
              Your comment
            </label>
            <textarea
              className="edit-field"
              id={inputId}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              placeholder="Ask a question. Share a thought."
              maxLength={2000}
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
        <small>Be curious. Be kind.</small>
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
              Post comment
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
