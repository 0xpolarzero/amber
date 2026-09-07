import {
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react'
import { Icon } from './icon'

export type FilterOption = {
  id: string
  name: string
  selected: boolean
  hint?: string
  leading?: ReactNode
}

export function FilterDropdown({
  label,
  options,
  triggerRef,
  onToggle,
}: {
  label: 'Group' | 'Author'
  options: FilterOption[]
  triggerRef: RefObject<HTMLButtonElement | null>
  onToggle: (id: string) => void
}) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [activeId, setActiveId] = useState<string | null>(null)
  const root = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLInputElement>(null)
  const popupId = useId()
  const listId = `${popupId}-list`
  const choices = options.filter((option) =>
    `${option.name} ${option.hint ?? ''}`
      .toLocaleLowerCase()
      .includes(query.trim().toLocaleLowerCase()),
  )
  const active = choices.find((choice) => choice.id === activeId)
  useEffect(() => {
    if (!open) return
    input.current?.focus()
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [open])
  const show = () => {
    setQuery('')
    setActiveId(null)
    setOpen(true)
  }
  const toggle = (id: string) => {
    onToggle(id)
    setQuery('')
    input.current?.focus()
  }
  return (
    <div ref={root} className="filter-dropdown" data-kind={label.toLowerCase()}>
      <button
        type="button"
        ref={triggerRef}
        className="filter-trigger"
        aria-label={`Filter by ${label.toLowerCase()}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={popupId}
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            show()
          }
        }}
      >
        {label}
        <Icon name="chevronDown" />
      </button>
      <div
        id={popupId}
        className="filter-popup"
        role="dialog"
        aria-label={`${label} filters`}
        hidden={!open}
        onBlur={(event) => {
          if (!root.current?.contains(event.relatedTarget)) setOpen(false)
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          setOpen(false)
          triggerRef.current?.focus()
        }}
      >
        <div className="filter-query">
          <Icon name="search" />
          <input
            ref={input}
            role="combobox"
            aria-label={`Search ${label.toLowerCase()}s`}
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={
              open && active ? `${listId}-${active.id}` : undefined
            }
            autoComplete="off"
            placeholder={`Search ${label.toLowerCase()}s…`}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value)
              setActiveId(null)
            }}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                event.preventDefault()
                const current = choices.findIndex(
                  (choice) => choice.id === activeId,
                )
                const next =
                  event.key === 'ArrowDown'
                    ? Math.min(current + 1, choices.length - 1)
                    : current <= 0
                      ? choices.length - 1
                      : current - 1
                const choice = choices[next]
                setActiveId(choice?.id ?? null)
                if (choice)
                  document
                    .getElementById(`${listId}-${choice.id}`)
                    ?.scrollIntoView({ block: 'nearest' })
              } else if (event.key === 'Enter' && active) {
                event.preventDefault()
                toggle(active.id)
              }
            }}
          />
        </div>
        <div
          id={listId}
          role="listbox"
          aria-label={`${label}s`}
          aria-multiselectable="true"
          tabIndex={-1}
        >
          {choices.map((choice) => (
            <button
              type="button"
              role="option"
              key={choice.id}
              id={`${listId}-${choice.id}`}
              aria-selected={choice.selected}
              data-active={activeId === choice.id}
              tabIndex={-1}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => toggle(choice.id)}
            >
              {choice.leading && (
                <span className="filter-option-icon" aria-hidden="true">
                  {choice.leading}
                </span>
              )}
              <span>{choice.name}</span>
              {choice.hint && <small>{choice.hint}</small>}
              <span className="filter-option-check" aria-hidden="true">
                {choice.selected && <Icon name="check" />}
              </span>
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
