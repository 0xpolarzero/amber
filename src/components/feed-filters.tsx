import { type ReactNode, useRef } from 'react'
import { type FeedSearch, selectFilterOptions } from '../domain/feed'
import { usePreview } from '../preview/provider'
import { Avatar } from './avatar'
import { FilterCombobox } from './filter-combobox'
import { Icon, type IconName } from './icon'

export function FeedFilters({
  search,
  update,
  controls,
}: {
  search: FeedSearch
  update: (search: FeedSearch) => void
  controls: ReactNode
}) {
  const { state, user } = usePreview()
  const groupInput = useRef<HTMLInputElement>(null)
  const authorInput = useRef<HTMLInputElement>(null)
  const bookmark = useRef<HTMLButtonElement>(null)
  const groups = search.groups ?? []
  const authors = search.authors ?? []
  const options = selectFilterOptions(state, search, user)
  const chips = [
    ...groups.map((id) => ({
      id: `group-${id}`,
      name: state.groups[id]?.name ?? id,
      icon: 'group' as IconName,
      label: `Remove group filter ${state.groups[id]?.name ?? id}`,
      remove: () => {
        update({ ...search, groups: groups.filter((group) => group !== id) })
        groupInput.current?.focus()
      },
    })),
    ...authors.map((id) => ({
      id: `author-${id}`,
      name: id === 'me' ? 'Me' : (state.people[id]?.name ?? id),
      icon: 'user' as IconName,
      label: `Remove author filter ${id === 'me' ? 'Me' : (state.people[id]?.name ?? id)}`,
      remove: () => {
        update({
          ...search,
          authors: authors.filter((author) => author !== id),
        })
        authorInput.current?.focus()
      },
    })),
    ...(search.bookmarked
      ? [
          {
            id: 'bookmarked',
            name: 'Bookmarked',
            icon: 'bookmark' as IconName,
            label: 'Remove Bookmarked filter',
            remove: () => {
              update({ ...search, bookmarked: undefined })
              bookmark.current?.focus()
            },
          },
        ]
      : []),
  ]
  return (
    <>
      <fieldset className="feed-toolbar">
        <legend className="visually-hidden">Feed filters</legend>
        <FilterCombobox
          label="Group"
          icon="group"
          inputRef={groupInput}
          options={options.groups
            .filter((id) => !groups.includes(id))
            .map((id) => ({ id, name: state.groups[id].name }))}
          onSelect={(id) => update({ ...search, groups: [...groups, id] })}
        />
        <FilterCombobox
          label="Author"
          icon="user"
          inputRef={authorInput}
          options={options.authors
            .filter(
              (id) =>
                !authors.includes(id) &&
                !(id === 'me' && user && authors.includes(user)),
            )
            .map((id) => {
              const personId = id === 'me' ? user : id
              return {
                id,
                name: id === 'me' ? 'Me' : state.people[id].name,
                hint:
                  id === 'me'
                    ? user
                      ? state.people[user].name
                      : 'Sign in'
                    : undefined,
                leading: personId ? (
                  <Avatar personId={personId} size="tiny" />
                ) : undefined,
              }
            })}
          onSelect={(id) => update({ ...search, authors: [...authors, id] })}
        />
        <button
          type="button"
          ref={bookmark}
          className={`bookmark-filter ${search.bookmarked ? 'active' : ''}`}
          aria-label="Bookmarks"
          title="Bookmarks"
          aria-pressed={Boolean(search.bookmarked)}
          onClick={() =>
            update({
              ...search,
              bookmarked: search.bookmarked ? undefined : true,
            })
          }
        >
          <Icon name="bookmark" />
        </button>
        <div className="feed-controls">{controls}</div>
      </fieldset>
      {chips.length > 0 && (
        <fieldset className="active-filters">
          <legend className="visually-hidden">Active filters</legend>
          {chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="filter-chip"
              aria-label={chip.label}
              onClick={chip.remove}
            >
              <Icon name={chip.icon} />
              {chip.name}
              <Icon name="close" />
            </button>
          ))}
        </fieldset>
      )}
    </>
  )
}
