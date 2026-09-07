import { createFileRoute } from '@tanstack/react-router'
import { ConversationPage } from '../pages/conversation-page'

export const Route = createFileRoute('/messages/$postId')({ component: Page })

function Page() {
  return <ConversationPage postId={Route.useParams().postId} />
}
