import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/messages')({
  head: () => ({ meta: [{ title: 'Messages · Amber' }] }),
  component: Outlet,
})
