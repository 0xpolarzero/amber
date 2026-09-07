import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/messages/')({
  beforeLoad: () => {
    throw redirect({ to: '/agent' })
  },
})
