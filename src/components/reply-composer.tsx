import { useForm } from '@tanstack/react-form'
import { useEffect, useId, useRef } from 'react'
import { AnswerForm } from '../domain/forms'
import { usePreview } from '../preview/provider'

export function ReplyComposer({
  postId,
  draft,
  focusOnMount,
  onReview,
}: {
  postId: string
  draft: string
  focusOnMount: boolean
  onReview: (text: string) => void
}) {
  const { dispatch } = usePreview()
  const id = useId()
  const input = useRef<HTMLTextAreaElement>(null)
  const form = useForm({
    defaultValues: { text: draft },
    validators: { onChange: AnswerForm },
    onSubmit: ({ value }) => onReview(value.text.trim()),
  })
  useEffect(() => {
    if (focusOnMount) input.current?.focus()
  }, [focusOnMount])
  useEffect(() => {
    resizeReply(input.current)
  }, [])
  return (
    <form
      className="reply-composer"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="text">
        {(field) => (
          <>
            <label className="visually-hidden" htmlFor={id}>
              Your answer
            </label>
            <textarea
              id={id}
              ref={input}
              rows={2}
              maxLength={1000}
              placeholder="Reply to Amber…"
              value={field.state.value}
              onChange={(event) => {
                field.handleChange(event.target.value)
                resizeReply(event.target)
                dispatch({
                  type: 'draftAnswer',
                  postId,
                  text: event.target.value,
                })
              }}
              onBlur={field.handleBlur}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  (event.metaKey || event.ctrlKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  if (field.state.value.trim()) void form.handleSubmit()
                }
              }}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={
                field.state.meta.errors.length ? `${id}-error` : `${id}-hint`
              }
            />
            {field.state.meta.errors.length > 0 && (
              <p className="field-error" id={`${id}-error`}>
                Add a little text before continuing.
              </p>
            )}
          </>
        )}
      </form.Field>
      <div className="reply-composer-actions">
        <small id={`${id}-hint`}>Review before updating your post.</small>
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
              Review update
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}

function resizeReply(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}
