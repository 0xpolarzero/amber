import { createFileRoute } from '@tanstack/react-router'
import workflow from '../../docs/agent/workflow.ts?raw'

export const Route = createFileRoute('/agent-workflow')({
  server: {
    handlers: {
      GET: () =>
        new Response(workflow, {
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        }),
    },
  },
})
