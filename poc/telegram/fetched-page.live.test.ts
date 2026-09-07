// One bounded Google Pro subscription check using a fresh response body value.
import { randomUUID } from 'node:crypto'
import { writeFile } from 'node:fs/promises'
import { Effect, Schema } from 'effect'
import { expect, it } from 'vitest'
import { antigravity, modelId } from './antigravity'
import { jsonSchema } from './model'
import type { ModelObservation } from './tools'

const Result = Schema.Struct({ uuid: Schema.NullOr(Schema.String) })

it('makes the current native fetch body readable through the scoped reader', async () => {
  const nonce = randomUUID()
  const sourceUrl = `https://httpbin.org/uuid?amber_probe=${nonce}`
  const observations: ModelObservation[] = []
  const raw = await Effect.runPromise(
    antigravity({
      task: 'fetched-page-verification',
      instruction: [
        `Call read_url_content with exactly ${sourceUrl}.`,
        'After that call completes, call the Amber MCP tool readFetchedPage with the same URL.',
        'The native fetch receipt is not the response body. Read the body through readFetchedPage.',
        'Return the uuid field from the actual response body, or null if the body is unreadable.',
        'Do not use view_file, shell, filesystem, browser, or subagent tools.',
      ].join('\n'),
      input: { probe: 'fresh-body-read' },
      outputSchema: jsonSchema(Result),
      tools: [],
      nativeTools: ['read_url_content'],
      callTool: () => Effect.die(new Error('No database tool is enabled in this verification.')),
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
  const fetchCall = observations.find(
    (observation): observation is Extract<ModelObservation, { kind: 'native-tool' }> =>
      observation.kind === 'native-tool' && observation.name === 'read_url_content',
  )
  const pageContent =
    fetchCall?.output && typeof fetchCall.output === 'object'
      ? String(Reflect.get(fetchCall.output, 'pageContent') ?? '')
      : ''
  const bodyUuid = /["']?uuid["']?\s*:\s*["']([0-9a-f-]+)["']/i.exec(pageContent)?.[1]
  const forbidden = ['view_file', 'run_command', 'read_file', 'list_dir']

  expect(configuration?.declaredTools).toEqual([
    'finish',
    'read_url_content',
    'amber/readFetchedPage',
  ])
  expect(configuration?.observedTools).toEqual(['read_url_content', 'amber/readFetchedPage'])
  expect(configuration?.observedTools.filter((name) => forbidden.includes(name))).toEqual([])
  expect(configuration?.failedTools.filter((name) => forbidden.includes(name))).toEqual([])
  expect(fetchCall?.output).toMatchObject({
    provenance: 'antigravity-cli-step-artifact-v1',
    status: 'success',
  })
  expect(bodyUuid).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i)
  expect(bodyUuid).not.toBe(nonce)
  expect(result.uuid).toBe(bodyUuid)

  await writeFile(
    new URL('./fetched-page-result.json', import.meta.url),
    `${JSON.stringify(
      {
        mode: 'live-fetched-page',
        cli: 'agy 1.1.27',
        model: modelId,
        sourceHost: new URL(sourceUrl).hostname,
        configuredTools: configuration?.declaredTools,
        observedTools: configuration?.observedTools,
        failedTools: configuration?.failedTools,
        fetchStatus:
          fetchCall?.output && typeof fetchCall.output === 'object'
            ? Reflect.get(fetchCall.output, 'status')
            : undefined,
        bodyUuid,
        resultUuid: result.uuid,
        exactMatch: result.uuid === bodyUuid,
      },
      null,
      2,
    )}\n`,
  )
}, 190_000)
