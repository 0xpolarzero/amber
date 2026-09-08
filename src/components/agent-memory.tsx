import { useForm } from '@tanstack/react-form'
import { useEffect, useId, useRef, useState } from 'react'
import { MemoryForm } from '../domain/forms'
import { usePreview } from '../preview/provider'
import type { AgentMemory } from '../preview/state'
import { Icon } from './icon'

export function AgentMemoryPanel({ id }: { id: string }) {
  const { agent, dispatch } = usePreview()
  const [editing, setEditing] = useState<AgentMemory | 'new' | null>(null)
  const [query, setQuery] = useState('')
  const addButton = useRef<HTMLButtonElement>(null)
  if (!agent) return null
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const memories = normalizedQuery
    ? agent.memories.filter((memory) =>
        memory.text.toLocaleLowerCase().includes(normalizedQuery),
      )
    : agent.memories
  const finish = () => {
    setEditing(null)
    requestAnimationFrame(() => addButton.current?.focus())
  }
  return (
    <section
      className="composer-panel memory-panel"
      id={id}
      aria-labelledby={`${id}-title`}
    >
      <div className="memory-panel-header">
        <div>
          <h2 id={`${id}-title`}>Memory</h2>
          <p>{agent.memories.length} saved</p>
        </div>
        {!editing ? (
          <label className="memory-search">
            <span className="visually-hidden">Search memory</span>
            <Icon name="search" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search memory"
            />
          </label>
        ) : null}
      </div>
      <div className="memory-panel-content">
        {editing ? (
          <MemoryEditor
            key={editing === 'new' ? 'new' : editing.id}
            memory={editing === 'new' ? undefined : editing}
            onDone={finish}
          />
        ) : (
          <>
            <div className="memory-list">
              {memories.map((memory) => (
                <div className="memory-entry" key={memory.id}>
                  <p>{memory.text}</p>
                  <div className="memory-actions">
                    <button
                      type="button"
                      onClick={() => setEditing(memory)}
                      aria-label={`Edit memory: ${memory.text}`}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        dispatch({ type: 'forgetMemory', id: memory.id })
                        requestAnimationFrame(() => addButton.current?.focus())
                      }}
                      aria-label={`Forget memory: ${memory.text}`}
                    >
                      Forget
                    </button>
                  </div>
                </div>
              ))}
              {!agent.memories.length ? (
                <p className="memory-empty">No saved preferences yet.</p>
              ) : null}
              {agent.memories.length > 0 && !memories.length ? (
                <p className="memory-empty">
                  No preferences match your search.
                </p>
              ) : null}
            </div>
            {agent.memoryHistory.length > 0 && !normalizedQuery ? (
              <details className="memory-history">
                <summary>Recent memory changes</summary>
                <ol>
                  {[...agent.memoryHistory].reverse().map((event) => (
                    <li
                      key={`${event.id}-${event.kind}-${event.before ?? ''}-${event.after ?? ''}`}
                    >
                      <strong>
                        {event.kind === 'created'
                          ? 'Created'
                          : event.kind === 'replaced'
                            ? 'Replaced'
                            : 'Deleted'}
                      </strong>
                      {event.kind === 'replaced' ? (
                        <span>
                          {event.before} → {event.after}
                        </span>
                      ) : (
                        <span>{event.after ?? event.before}</span>
                      )}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </>
        )}
      </div>
      {!editing ? (
        <button
          type="button"
          ref={addButton}
          className="memory-add"
          onClick={() => setEditing('new')}
        >
          Add preference
        </button>
      ) : null}
    </section>
  )
}

function MemoryEditor({
  memory,
  onDone,
}: {
  memory?: AgentMemory
  onDone: () => void
}) {
  const { dispatch } = usePreview()
  const id = useId()
  const input = useRef<HTMLTextAreaElement>(null)
  useEffect(() => {
    input.current?.focus()
  }, [])
  const form = useForm({
    defaultValues: { text: memory?.text ?? '' },
    validators: { onChange: MemoryForm },
    onSubmit: ({ value }) => {
      dispatch({
        type: 'saveMemory',
        id: memory?.id ?? crypto.randomUUID(),
        text: value.text,
      })
      onDone()
    },
  })
  return (
    <form
      className="memory-editor"
      onSubmit={(event) => {
        event.preventDefault()
        void form.handleSubmit()
      }}
    >
      <form.Field name="text">
        {(field) => (
          <>
            <label className="field-label" htmlFor={id}>
              Preference
            </label>
            <textarea
              id={id}
              ref={input}
              className="edit-field"
              rows={3}
              maxLength={500}
              value={field.state.value}
              onChange={(event) => field.handleChange(event.target.value)}
              onBlur={field.handleBlur}
              aria-invalid={field.state.meta.errors.length > 0}
              aria-describedby={
                field.state.meta.errors.length ? `${id}-error` : undefined
              }
            />
            {field.state.meta.errors.length > 0 && (
              <p className="field-error" id={`${id}-error`}>
                Write a preference in 500 characters or fewer.
              </p>
            )}
          </>
        )}
      </form.Field>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={onDone}>
          Cancel
        </button>
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
              Save preference
            </button>
          )}
        </form.Subscribe>
      </div>
    </form>
  )
}
