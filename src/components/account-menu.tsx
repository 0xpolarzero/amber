import { Link } from '@tanstack/react-router'
import { useEffect, useId, useRef, useState } from 'react'
import { Avatar } from './avatar'
import { Icon } from './icon'

export function AccountMenu({
  user,
  onSignOut,
}: {
  user: string
  onSignOut: () => void
}) {
  const [open, setOpen] = useState(false)
  const root = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const menu = useRef<HTMLDivElement>(null)
  const initialFocus = useRef(0)
  const id = useId()
  const close = () => {
    setOpen(false)
    trigger.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    const items =
      menu.current?.querySelectorAll<HTMLElement>('[role="menuitem"]')
    items?.[initialFocus.current === -1 ? items.length - 1 : 0]?.focus()
    const dismissOutside = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false)
    }
    document.addEventListener('pointerdown', dismissOutside)
    document.addEventListener('focusin', dismissOutside)
    return () => {
      document.removeEventListener('pointerdown', dismissOutside)
      document.removeEventListener('focusin', dismissOutside)
    }
  }, [open])

  return (
    <div className="account-menu" ref={root}>
      <button
        type="button"
        className="avatar-button"
        ref={trigger}
        id={`${id}-trigger`}
        aria-label="Your account"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          initialFocus.current = 0
          setOpen(!open)
        }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault()
            initialFocus.current = event.key === 'ArrowUp' ? -1 : 0
            setOpen(true)
          }
        }}
      >
        <Avatar personId={user} />
      </button>
      {open && (
        <div className="account-dropdown">
          <div
            ref={menu}
            id={id}
            role="menu"
            aria-labelledby={`${id}-trigger`}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                close()
              } else if (event.key === 'Tab') {
                close()
              } else {
                const items = Array.from(
                  event.currentTarget.querySelectorAll<HTMLElement>(
                    '[role="menuitem"]',
                  ),
                )
                const current =
                  document.activeElement instanceof HTMLElement
                    ? items.indexOf(document.activeElement)
                    : -1
                let next = -1
                if (event.key === 'ArrowDown')
                  next = (current + 1) % items.length
                else if (event.key === 'ArrowUp')
                  next = (current - 1 + items.length) % items.length
                else if (event.key === 'Home') next = 0
                else if (event.key === 'End') next = items.length - 1
                else if (event.key === ' ') {
                  event.preventDefault()
                  items[current]?.click()
                }
                if (next !== -1) {
                  event.preventDefault()
                  items[next]?.focus()
                }
              }
            }}
          >
            <Link
              role="menuitem"
              tabIndex={-1}
              to="/people/$personId"
              params={{ personId: user }}
              onClick={close}
            >
              <Icon name="user" />
              Your profile
            </Link>
            <button
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={onSignOut}
            >
              <Icon name="logout" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
