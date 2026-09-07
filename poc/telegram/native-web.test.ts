// One bounded Google Pro subscription check against stable, public IANA documentation.
import { writeFile } from 'node:fs/promises'
import { Effect, Schema } from 'effect'
import { expect, it } from 'vitest'
import { antigravity, modelId, nativeWebTools } from './antigravity'
import { jsonSchema } from './model'
import { pagesFromNativeTool } from './native-web'
import type { ModelObservation } from './tools'

const Result = Schema.Struct({
  fact: Schema.String,
  sourceUrl: Schema.String,
})
const sourceUrl = 'https://www.iana.org/help/example-domains'

it('uses native search and fetch and records their actual source evidence', async () => {
  const observations: ModelObservation[] = []
  const raw = await Effect.runPromise(
    antigravity({
      task: 'native-web-verification',
      instruction: [
        'Verify one stable fact using Antigravity native web tools.',
        'Call search_web for “IANA example domains reserved documentation”.',
        `Then call read_url_content with exactly ${sourceUrl}.`,
        'Return a short fact stating what example domains are reserved for and that exact source URL.',
        'Do not use prior knowledge as evidence and do not call any other tool except finish.',
      ].join('\n'),
      input: { assertion: 'IANA reserves example domains for documentation.' },
      outputSchema: jsonSchema(Result),
      tools: [],
      nativeTools: nativeWebTools,
      callTool: () => Effect.die(new Error('No MCP tool is enabled in this verification.')),
      observe: (observation) =>
        Effect.sync(() => {
          observations.push(observation)
        }),
    }).pipe(Effect.timeout('3 minutes')),
  )
  const result = Schema.decodeUnknownSync(Result)(raw)
  const configuration = observations.find(
    (observation): observation is Extract<ModelObservation, { kind: 'configuration' }> =>
      observation.kind === 'configuration',
  )
  const calls = observations.filter(
    (observation): observation is Extract<ModelObservation, { kind: 'native-tool' }> =>
      observation.kind === 'native-tool',
  )
  const pages = calls.flatMap(({ name, input, output }) => pagesFromNativeTool(name, input, output))

  expect(configuration).toMatchObject({
    agent: 'amber',
    model: modelId,
    declaredTools: ['finish', 'search_web', 'read_url_content'],
  })
  expect(calls.map(({ name }) => name)).toEqual(['search_web', 'read_url_content'])
  expect(pages.some((page) => page.url === sourceUrl)).toBe(true)
  expect(result.sourceUrl).toBe(sourceUrl)
  expect(result.fact.toLowerCase()).toMatch(/example|documentation/)

  await writeFile(
    new URL('./native-web-result.json', import.meta.url),
    `${JSON.stringify(
      {
        mode: 'live-native-web',
        cli: 'agy 1.1.27',
        model: modelId,
        configuredTools: configuration?.declaredTools,
        runtimeInventory: configuration?.runtimeInventory,
        calls: calls.map(({ name, input, output }) => ({
          name,
          input,
          sourceUrls: pagesFromNativeTool(name, input, output).map(({ url }) => url),
          outputPreview: String(output).replace(/\s+/g, ' ').slice(0, 400),
        })),
        result,
      },
      null,
      2,
    )}\n`,
  )
}, 190_000)
