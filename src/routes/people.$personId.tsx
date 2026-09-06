import { createFileRoute, notFound } from '@tanstack/react-router'
import { ProfilePage } from '../pages/profile-page'
import { feedQuery } from '../queries/feed'

export const Route = createFileRoute('/people/$personId')({
  loader: async ({ context, params }) => {
    const feed = await context.queryClient.ensureQueryData(feedQuery)
    const person = feed.people[params.personId]
    if (!person) throw notFound()
    return { name: person.name }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.name ?? 'Profile'} · Field` }],
  }),
  component: Page,
})
function Page() {
  return <ProfilePage personId={Route.useParams().personId} />
}
