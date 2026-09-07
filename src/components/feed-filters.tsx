import { type ReactNode, useRef } from 'react'
import { type FeedSearch, selectFilterOptions } from '../domain/feed'
import { usePreview } from '../preview/provider'
import { Avatar } from './avatar'
import { FilterDropdown } from './filter-dropdown'
import { Icon, type IconName } from './icon'

export function FeedFilters({
  search,
  update,
  searchControl,
  sortControl,
}: {
  search: FeedSearch
  update: (search: FeedSearch) => void
  searchControl: ReactNode
  sortControl: ReactNode
}) {
  const { state, user } = usePreview()
  const groupTrigger = useRef<HTMLButtonElement>(null)
  const authorTrigger = useRef<HTMLButtonElement>(null)
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
        groupTrigger.current?.focus()
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
        authorTrigger.current?.focus()
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
        {searchControl}
        <FilterDropdown
          label="Group"
          triggerRef={groupTrigger}
          options={options.groups.map((id) => ({
            id,
            name: state.groups[id].name,
            selected: groups.includes(id),
          }))}
          onToggle={(id) =>
            update({
              ...search,
              groups: groups.includes(id)
                ? groups.filter((group) => group !== id)
                : [...groups, id],
            })
          }
        />
        <FilterDropdown
          label="Author"
          triggerRef={authorTrigger}
          options={options.authors.map((id) => {
            const personId = id === 'me' ? user : id
            return {
              id,
              selected:
                authors.includes(id) ||
                Boolean(id === 'me' && user && authors.includes(user)),
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
          onToggle={(id) => {
            const aliases = id === 'me' && user ? ['me', user] : [id]
            update({
              ...search,
              authors: authors.some((author) => aliases.includes(author))
                ? authors.filter((author) => !aliases.includes(author))
                : [...authors, id],
            })
          }}
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
          <span>Bookmarks</span>
        </button>
        {sortControl}
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
          <button
            type="button"
            className="clear-filters"
            onClick={() => {
              update({
                ...search,
                groups: undefined,
                authors: undefined,
                bookmarked: undefined,
              })
              groupTrigger.current?.focus()
            }}
          >
            Clear filters
          </button>
        </fieldset>
      )}
    </>
  )
}
