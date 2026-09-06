import { EmptyState } from '../components/empty-state'
import { PostCard } from '../components/post-card'
import { usePreview } from '../preview/provider'

export function DashboardPage() {
  const { state, user, openDialog } = usePreview()
  const posts = state.posts.filter((post) => post.author === user)
  return (
    <>
      <header className="owner-header">
        <div>
          <h1>My posts</h1>
          <p>Your work. Always yours to edit.</p>
        </div>
      </header>
      {!user ? (
        <div className="empty">
          <h2>Your work belongs here.</h2>
          <p>Sign in to see the posts tied to you.</p>
          <button
            type="button"
            className="button"
            onClick={() => openDialog({ kind: 'signin' })}
          >
            Sign in
          </button>
        </div>
      ) : posts.length ? (
        posts.map((post) => <PostCard key={post.id} post={post} owner />)
      ) : (
        <EmptyState title="Your work belongs here." icon="user">
          Projects shared from your Telegram account will appear here.
        </EmptyState>
      )}
    </>
  )
}
