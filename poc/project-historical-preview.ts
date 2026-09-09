import { writeFile } from 'node:fs/promises'
import capture from './messaging/result.json' with { type: 'json' }
import { type HistoricalMessagingCapture, projectHistoricalTurn } from './preview-projection.ts'

const projection = projectHistoricalTurn(capture as HistoricalMessagingCapture, 'live-turn-2')
const target = new URL('../src/preview/generated/amber-real-preview.ts', import.meta.url)

await writeFile(
  target,
  `// Generated from poc/messaging/result.json by poc/project-historical-preview.ts.\nexport default ${JSON.stringify(projection, null, 2)} as const\n`,
)
