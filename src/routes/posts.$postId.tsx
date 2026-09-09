import { createFileRoute, notFound } from '@tanstack/react-router'
import { PostPage } from '../pages/post-page'
import question from '../preview/generated/amber-question-preview'
import preview from '../preview/generated/amber-real-preview'
import { feedQuery } from '../queries/feed'

export const Route = createFileRoute('/posts/$postId')({
  loader: async ({ context, params }) => {
    const feed = await context.queryClient.ensureQueryData(feedQuery)
    const post = feed.posts.find((post) => post.id === params.postId)
    const recorded = [
      ...preview.posts.after,
      ...question.messaging.diffs.map(({ after }) => after),
    ].find(({ id }) => id === params.postId)
    if (!post && !recorded) throw notFound()
    return { title: post?.title ?? recorded?.title ?? 'Post' }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? 'Post'} · Amber` }],
  }),
  component: Page,
})
function Page() {
  return <PostPage postId={Route.useParams().postId} />
}
