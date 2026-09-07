import { createFileRoute } from '@tanstack/react-router'
import design from '../../docs/agent/agent.html?raw'

export const Route = createFileRoute('/agent-design')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          design.replaceAll('href="workflow.ts"', 'href="/agent-workflow"'),
          {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          },
        ),
    },
  },
})
