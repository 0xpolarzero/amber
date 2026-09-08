import { createFileRoute, notFound } from '@tanstack/react-router'
import { PostPage } from '../pages/post-page'
import { feedQuery } from '../queries/feed'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context, params }) => {
    const feed = await context.queryClient.ensureQueryData(feedQuery)
    const post = feed.posts.find((post) => post.id === params.postId)
    if (
      !post &&
      !['atlas-preview', 'aurora-preview', 'clipwise-preview'].includes(
        params.postId,
      )
    )
      throw notFound()
    return { title: post?.title ?? 'Post' }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? 'Post'} · Amber` }],
  }),
  component: Page,
})
function Page() {
  return <PostPage postId={Route.useParams().postId} />
}
