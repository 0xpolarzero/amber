import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { piOpenRouter } from '../../shared/pi'
import { runImport } from './import'
import type { Snapshot } from './snapshot'

const root = resolve(import.meta.dirname, '../../..')
const snapshot = JSON.parse(
  await readFile(resolve(root, '.amber/telegram/snapshot.json'), 'utf8'),
) as Snapshot
const directory = resolve(root, process.env.TELEGRAM_IMPORT_DIR ?? '.amber/telegram/import')
const result = await runImport(snapshot, {
  model: piOpenRouter,
  batchSize: 25,
  directory,
  onProgress: ({ completedMessages, state }) => {
    console.log(
      `${completedMessages} text messages processed · ${state.posts.length} posts · ${state.pendingRequests.filter(({ addressed }) => !addressed).length} pending questions`,
    )
  },
})
console.log(
  `Finished: ${result.completedMessages} processed, ${result.skipped.length} unsupported messages. Results saved locally in ${directory}/import.json.`,
)
