import { Avatar } from '../components/avatar'
import { BackLink } from '../components/back-link'
import { EmptyState } from '../components/empty-state'
import { PostCard } from '../components/post-card'
import { usePreview } from '../preview/provider'

export function ProfilePage({ personId }: { personId: string }) {
  const { state } = usePreview()
  const person = state.people[personId]
  if (!person)
    return (
      <EmptyState title="This person isn’t here yet.">
        Return to the feed to meet the people making things.
      </EmptyState>
    )
  const posts = state.posts.filter((post) => post.author === personId)
  return (
    <>
      <BackLink title="Profile" />
      <header className="profile-header">
        <Avatar personId={personId} size="large" />
        <h1>{person.name}</h1>
        <p>{person.bio}</p>
        <div className="profile-meta">
          {posts.length} {posts.length === 1 ? 'project' : 'projects'}
        </div>
      </header>
      <h2 className="section-label">Shared work</h2>
      {posts.length ? (
        posts.map((post) => <PostCard key={post.id} post={post} />)
      ) : (
        <EmptyState title="A little quiet here.">
          Projects this person shares will appear here.
        </EmptyState>
      )}
    </>
  )
}
