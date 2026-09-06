import { useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { feedQuery } from '../queries/feed'

export const Route = createFileRoute('/')({ component: FeedPage })

function FeedPage() {
  const { data } = useSuspenseQuery(feedQuery)
  return (
    <>
      <header className="topbar">
        <div className="header-inner">
          <a className="brand" href="/">
            Field
            <span className="brand-dot" />
          </a>
        </div>
      </header>
      <main>
        <header className="feed-header">
          <h1>From the group</h1>
          <p className="feed-subtitle">
            Small projects, shared by the people making them.
          </p>
        </header>
        {data.posts.map((post) => (
          <article className="post" key={post.id}>
            <div className="byline">{data.people[post.author].name}</div>
            <h2 className="post-title">{post.title}</h2>
            <p className="post-summary">{post.summary}</p>
          </article>
        ))}
      </main>
    </>
  )
}
