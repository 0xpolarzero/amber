import { createFileRoute } from '@tanstack/react-router'
import { parseFeedSearch } from '../domain/feed'
import { FeedPage } from '../pages/feed-page'

export const Route = createFileRoute('/saved')({
  validateSearch: parseFeedSearch,
  component: Page,
})
function Page() {
  return <FeedPage search={Route.useSearch()} onlySaved />
}
