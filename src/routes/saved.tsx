import { createFileRoute, redirect } from '@tanstack/react-router'
import { parseFeedSearch } from '../domain/feed'

export const Route = createFileRoute('/saved')({
  validateSearch: parseFeedSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: '/', search: { ...search, bookmarked: true } })
  },
})
