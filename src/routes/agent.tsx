import { createFileRoute } from '@tanstack/react-router'
import { AgentPage } from '../pages/agent-page'

export const Route = createFileRoute('/agent')({
  validateSearch: (search: Record<string, unknown>): { post?: string } => ({
    post:
      typeof search.post === 'string' && search.post.length <= 200
        ? search.post
        : undefined,
  }),
  head: () => ({ meta: [{ title: 'Agent · Amber' }] }),
  component: Page,
})
function Page() {
  return <AgentPage postId={Route.useSearch().post} />
}
