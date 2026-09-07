import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

const source = process.env.SMITHERS_SOURCE
if (!source) throw new Error('Set SMITHERS_SOURCE to the Smithers checkout pinned in workflow.ts.')

const require = createRequire(import.meta.url)
const revision = '6d40cbc3cdae14fc1a8b65c5ecbc0f01966b468c'
if (
  execFileSync('git', ['rev-parse', 'HEAD'], { cwd: source, encoding: 'utf8' }).trim() !== revision
)
  throw new Error(`Reference tests require Smithers source at ${revision}.`)

export default defineConfig({
  plugins: [
    {
      name: 'smithers-reference-source',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'effect' || id.startsWith('effect/')) return require.resolve(id)
        const match = /^@smthrs\/([^/]+)(?:\/(.*))?$/.exec(id)
        if (!match) return
        const path = resolve(
          source,
          'packages/smithers/flows',
          match[1],
          'src',
          match[2] ?? 'index',
        )
        for (const candidate of [`${path}.ts`, `${path}/index.ts`])
          if (existsSync(candidate)) return candidate
        throw new Error(`Missing Smithers reference source: ${id}`)
      },
    },
  ],
  test: { include: ['docs/agent/workflow.test.ts'] },
})
