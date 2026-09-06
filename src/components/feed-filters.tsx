import { useId, useRef, useState } from 'react'
import type { FeedSearch } from '../domain/feed'
import { usePreview } from '../preview/provider'
import { Avatar } from './avatar'
import { Icon } from './icon'

export function FeedFilters({
  search,
  update,
}: {
  search: FeedSearch
  update: (search: FeedSearch) => void
}) {
  const { state, user } = usePreview()
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const input = useRef<HTMLInputElement>(null)
  const listId = useId()
  const authors = search.authors ?? []
  const choices = [
    { id: 'me', name: 'Me', personId: user },
    ...Object.entries(state.people)
      .filter(
        ([id]) => id !== user && state.posts.some((post) => post.author === id),
      )
      .map(([id, person]) => ({ id, name: person.name, personId: id }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  ].filter(
    (choice) =>
      !authors.includes(choice.id) &&
      !(choice.id === 'me' && user && authors.includes(user)) &&
      `${choice.name} ${choice.personId ? state.people[choice.personId]?.name : ''}`
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()),
  )
  const selected = choices[active]
  const choose = (id: string) => {
    update({ ...search, authors: [...authors, id] })
    setQuery('')
    setActive(-1)
    setOpen(false)
    input.current?.focus()
  }
  return (
    <fieldset className="feed-filters">
      <legend className="visually-hidden">Feed filters</legend>
      <button
        type="button"
        className={`filter-chip ${search.bookmarked ? 'selected' : ''}`}
        aria-label={
          search.bookmarked ? 'Remove Bookmarked filter' : 'Bookmarks'
        }
        aria-pressed={Boolean(search.bookmarked)}
        onClick={() =>
          update({
            ...search,
            bookmarked: search.bookmarked ? undefined : true,
          })
        }
      >
        <Icon name="bookmark" />
        {search.bookmarked ? 'Bookmarked' : 'Bookmarks'}
        {search.bookmarked && <Icon name="close" />}
      </button>
      <div className="author-filter">
        <Icon name="user" />
        <input
          ref={input}
          role="combobox"
          aria-label="Filter by author"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            open && selected ? `${listId}-${selected.id}` : undefined
          }
          autoComplete="off"
          placeholder="Author"
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => {
            setOpen(false)
            setActive(-1)
          }}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(-1)
            setOpen(true)
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
              event.preventDefault()
              setOpen(true)
              const next =
                event.key === 'ArrowDown'
                  ? Math.min(open ? active + 1 : 0, choices.length - 1)
                  : active <= 0
                    ? choices.length - 1
                    : active - 1
              setActive(next)
              const choice = choices[next]
              if (choice)
                document
                  .getElementById(`${listId}-${choice.id}`)
                  ?.scrollIntoView({ block: 'nearest' })
            } else if (event.key === 'Enter' && open && selected) {
              event.preventDefault()
              choose(selected.id)
            } else if (event.key === 'Escape') {
              setOpen(false)
              setActive(-1)
              setQuery('')
            }
          }}
        />
        <Icon name="chevronDown" />
        <div className="author-popup" hidden={!open}>
          <div id={listId} role="listbox" aria-label="Authors">
            {choices.map((choice, index) => (
              <button
                type="button"
                role="option"
                key={choice.id}
                id={`${listId}-${choice.id}`}
                aria-selected={active === index}
                tabIndex={-1}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(choice.id)}
              >
                {choice.personId ? (
                  <Avatar personId={choice.personId} size="tiny" />
                ) : (
                  <span className="avatar tiny">
                    <Icon name="user" />
                  </span>
                )}
                <span>{choice.name}</span>
                {choice.id === 'me' && (
                  <small>{user ? state.people[user].name : 'Sign in'}</small>
                )}
              </button>
            ))}
          </div>
          {!choices.length && (
            <p className="author-no-results" role="status">
              No matching authors.
            </p>
          )}
        </div>
      </div>
      {authors.map((id) => {
        const name = id === 'me' ? 'Me' : (state.people[id]?.name ?? id)
        return (
          <button
            key={id}
            type="button"
            className="filter-chip selected"
            aria-label={`Remove author filter ${name}`}
            onClick={() => {
              update({
                ...search,
                authors: authors.filter((author) => author !== id),
              })
              input.current?.focus()
            }}
          >
            <Icon name="user" />
            {name}
            <Icon name="close" />
          </button>
        )
      })}
    </fieldset>
  )
}
