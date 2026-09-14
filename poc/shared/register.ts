import { existsSync, readFileSync } from 'node:fs'
import { registerHooks, stripTypeScriptTypes } from 'node:module'
import { fileURLToPath } from 'node:url'

// Run the same TypeScript workflows and raw MDX prompts outside Vite.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('.') && context.parentURL) {
      const url = new URL(specifier, context.parentURL)
      if (url.protocol === 'file:' && !url.search && !existsSync(fileURLToPath(url))) {
        for (const suffix of ['.ts', '/index.ts']) {
          const candidate = new URL(`${url.href}${suffix}`)
          if (existsSync(fileURLToPath(candidate))) return nextResolve(candidate.href, context)
        }
      }
    }
    return nextResolve(specifier, context)
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && url.endsWith('.ts') && url.includes('/node_modules/')) {
      return {
        format: 'module',
        source: stripTypeScriptTypes(readFileSync(new URL(url), 'utf8')),
        shortCircuit: true,
      }
    }
    if (url.endsWith('.mdx?raw')) {
      return {
        format: 'module',
        source: `export default ${JSON.stringify(readFileSync(new URL(url), 'utf8'))}`,
        shortCircuit: true,
      }
    }
    return nextLoad(url, context)
  },
})
