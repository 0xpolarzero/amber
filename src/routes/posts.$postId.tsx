import { createFileRoute, notFound } from '@tanstack/react-router'
import { PostPage } from '../pages/post-page'
import { feedQuery } from '../queries/feed'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context, params }) => {
    const feed = await context.queryClient.ensureQueryData(feedQuery)
    const post = feed.posts.find((post) => post.id === params.postId)
    if (!post) throw notFound()
    return { title: post.title }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? 'Post'} · Field` }],
  }),
  component: Page,
})
function Page() {
  return <PostPage postId={Route.useParams().postId} />
}
