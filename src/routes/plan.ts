import { createFileRoute } from '@tanstack/react-router'
import plan from '../../docs/implementation-plan.html?raw'

export const Route = createFileRoute('/plan')({
  server: {
    handlers: {
      GET: () =>
        new Response(plan.replaceAll('feed-prototype.html', '/'), {
          headers: { 'Content-Type': 'text/html; charset=utf-8' },
        }),
    },
  },
})
