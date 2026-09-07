import { useForm } from '@tanstack/react-form'
import { useEffect, useId, useRef } from 'react'
import { AnswerForm } from '../domain/forms'
import { usePreview } from '../preview/provider'
import { Icon } from './icon'

export function ReplyComposer({
  postId,
  draft,
}: {
  postId: string
  draft: string
}) {
  const { dispatch } = usePreview()
  const id = useId()
  const input = useRef<HTMLTextAreaElement>(null)
  const form = useForm({
    defaultValues: { text: draft },
    validators: { onChange: AnswerForm },
    onSubmit: ({ value, formApi }) => {
      dispatch({
        type: 'sendMessage',
        postId,
        id: crypto.randomUUID(),
        text: value.text,
      })
      formApi.reset({ text: '' })
      requestAnimationFrame(() => {
        resizeReply(input.current)
        input.current?.focus({ preventScroll: true })
      })
    },
  })
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
          <div className="reply-input">
            <label className="visually-hidden" htmlFor={id}>
              Message Amber
            </label>
            <textarea
              id={id}
              ref={input}
              rows={1}
              maxLength={1000}
              placeholder="Message Amber…"
              value={field.state.value}
              onChange={(event) => {
                field.handleChange(event.target.value)
                resizeReply(event.target)
                dispatch({
                  type: 'draftMessage',
                  postId,
                  text: event.target.value,
                })
              }}
              onBlur={field.handleBlur}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault()
                  if (field.state.value.trim()) void form.handleSubmit()
                }
              }}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={
                field.state.meta.errors.length ? `${id}-error` : undefined
              }
            />
            {field.state.meta.errors.length > 0 && (
              <p className="field-error" id={`${id}-error`}>
                Write a message to send.
              </p>
            )}
          </div>
        )}
      </form.Field>
      <form.Subscribe
        selector={(state) =>
          [state.canSubmit, state.isSubmitting, state.values.text] as const
        }
      >
        {([canSubmit, submitting, text]) => (
          <button
            type="submit"
            className="message-send"
            aria-label="Send message"
            title="Send message"
            disabled={!canSubmit || submitting || !text.trim()}
          >
            <Icon name="send" />
          </button>
        )}
      </form.Subscribe>
    </form>
  )
}

function resizeReply(element: HTMLTextAreaElement | null) {
  if (!element) return
  element.style.height = 'auto'
  element.style.height = `${element.scrollHeight}px`
}
