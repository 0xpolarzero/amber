import { createFileRoute, redirect } from '@tanstack/react-router'

export const Route = createFileRoute('/messages/$postId')({
  beforeLoad: ({ params }) => {
    throw redirect({ to: '/agent', search: { post: params.postId } })
  },
})
