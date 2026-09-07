import { createFileRoute } from '@tanstack/react-router'

const sources = import.meta.glob('../../docs/agent/**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export const Route = createFileRoute('/agent-workflow')({
  server: {
    handlers: {
      GET: ({ request }) => {
        const file =
          new URL(request.url).searchParams.get('file') ?? 'workflow.ts'
        const source = sources[`../../docs/agent/${file}`]
        return new Response(
          typeof source === 'string' ? source : 'File not found.',
          {
            status: typeof source === 'string' ? 200 : 404,
            headers: { 'Content-Type': 'text/plain; charset=utf-8' },
          },
        )
      },
    },
  },
})
