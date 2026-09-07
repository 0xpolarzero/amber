import { type ReactNode, type RefObject, useId, useState } from 'react'
import { Icon, type IconName } from './icon'

export type FilterOption = {
  id: string
  name: string
  hint?: string
  leading?: ReactNode
}

export function FilterCombobox({
  label,
  icon,
  options,
  inputRef,
  onSelect,
}: {
  label: 'Group' | 'Author'
  icon: IconName
  options: FilterOption[]
  inputRef: RefObject<HTMLInputElement | null>
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const listId = useId()
  const choices = options.filter((option) =>
    `${option.name} ${option.hint ?? ''}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  )
  const selected = choices.find((choice) => choice.id === activeId)
  const choose = (id: string) => {
    onSelect(id)
    setQuery('')
    setActiveId(null)
    setOpen(false)
    inputRef.current?.focus()
  }
  return (
    <div className="filter-combobox" data-kind={label.toLowerCase()}>
      <div className="filter-input">
        <Icon name={icon} />
        <input
          ref={inputRef}
          role="combobox"
          aria-label={`Filter by ${label.toLowerCase()}`}
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && selected ? `${listId}-${selected.id}` : undefined
          }
          autoComplete="off"
          placeholder={label}
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            setActiveId(null)
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setActiveId(null)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              const current = choices.findIndex(
                (choice) => choice.id === activeId,
              )
              const next =
                event.key === 'ArrowDown'
                  ? Math.min(open ? current + 1 : 0, choices.length - 1)
                  : current <= 0
                    ? choices.length - 1
                    : current - 1
              const choice = choices[next]
              setActiveId(choice?.id ?? null)
              if (choice)
                document
                  .getElementById(`${listId}-${choice.id}`)
                  ?.scrollIntoView({ block: 'nearest' })
            } else if (event.key === 'Enter' && open && selected) {
              event.preventDefault()
              choose(selected.id)
            } else if (event.key === 'Escape') {
              setOpen(false)
              setActiveId(null)
              setQuery('')
            }
          }}
        />
        <Icon name="chevronDown" />
      </div>
      <div className="filter-popup" hidden={!open}>
        <div id={listId} role="listbox" aria-label={`${label}s`}>
          {choices.map((choice) => (
            <button
              type="button"
              role="option"
              key={choice.id}
              id={`${listId}-${choice.id}`}
              aria-selected={activeId === choice.id}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => choose(choice.id)}
            >
              <span className="filter-option-icon" aria-hidden="true">
                {choice.leading ?? <Icon name={icon} />}
              </span>
              <span>{choice.name}</span>
              {choice.hint && <small>{choice.hint}</small>}
            </button>
          ))}
        </div>
        {!choices.length && (
          <p className="filter-no-results" role="status">
            No matching {label.toLowerCase()}s.
          </p>
        )}
      </div>
    </div>
  )
}
