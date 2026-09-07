import { createFileRoute } from '@tanstack/react-router'
import design from '../../docs/agent/agent.html?raw'

export const Route = createFileRoute('/agent-design')({
  server: {
    handlers: {
      GET: () =>
        new Response(
          design.replaceAll(
            /href="([\w./-]+\.ts)"/g,
            (_, file: string) =>
              `href="/agent-workflow?file=${encodeURIComponent(file)}" target="_blank" rel="noopener"`,
          ),
          {
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
          },
        ),
    },
  },
})
