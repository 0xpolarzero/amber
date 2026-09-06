import { type QueryClient, useSuspenseQuery } from '@tanstack/react-query'
import {
  createRootRouteWithContext,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from '@tanstack/react-router'
import favicon from '../assets/favicon.svg?no-inline'
import { AppShell } from '../components/app-shell'
import { PreviewProvider } from '../preview/provider'
import { feedQuery } from '../queries/feed'
import stylesheet from '../styles.css?url'

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      meta: [
        { charSet: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'color-scheme', content: 'light' },
        { title: 'Amber · From the group' },
        {
          name: 'description',
          content: 'Small projects, shared by the people making them.',
        },
      ],
      links: [
        { rel: 'stylesheet', href: stylesheet },
        { rel: 'icon', type: 'image/svg+xml', href: favicon },
      ],
    }),
    loader: ({ context }) => context.queryClient.ensureQueryData(feedQuery),
    shellComponent: RootDocument,
    component: Root,
    notFoundComponent: () => (
      <div className="empty">
        <h1>Page not found.</h1>
        <Link to="/" search={{ sort: 'latest', q: '' }}>
          Back to the feed
        </Link>
      </div>
    ),
    errorComponent: ({ reset }) => (
      <div className="empty">
        <h1>The feed could not load.</h1>
        <button type="button" className="text-button" onClick={reset}>
          Try again
        </button>
      </div>
    ),
  },
)

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}

function Root() {
  const { data } = useSuspenseQuery(feedQuery)
  return (
    <PreviewProvider feed={data}>
      <AppShell>
        <Outlet />
      </AppShell>
    </PreviewProvider>
  )
}
