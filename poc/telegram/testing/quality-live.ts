// Real agents; invented Telegram messages and explicitly supplied fake web pages.
// node --env-file=.amber/openrouter.env --import ./poc/shared/register.ts poc/telegram/testing/quality-live.ts
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import { Effect } from 'effect'
import { piOpenRouter } from '../../shared/pi'
import { reviewedPost } from '../quality'
import type * as S from '../schemas'
import { qualityCases } from './quality-cases'

const results: unknown[] = []
const selected = process.env.QUALITY_CASES?.split(',')
  .map((id) => id.trim())
  .filter(Boolean)
const unknown = selected?.filter((id) => !qualityCases.some((fixture) => fixture.id === id))
if (unknown?.length) throw new Error(`Unknown quality cases: ${unknown.join(', ')}`)
const fixtures = selected?.length
  ? qualityCases.filter((fixture) => selected.includes(fixture.id))
  : qualityCases
const outputPath =
  process.env.QUALITY_OUTPUT ||
  `.amber/telegram/quality-cases${selected?.length ? '-selected' : ''}.json`
await mkdir(dirname(outputPath), { recursive: true })
for (const fixture of fixtures) {
  const calls: unknown[] = []
  const owner = fixture.messages[0].authorId ?? 'maker'
  const context: typeof S.ProjectContext.Type = {
    work: {
      batchId: fixture.id,
      groupId: 'quality-fixtures',
      candidateId: fixture.id,
      revision: 0,
      ownerId: owner,
      candidate: {
        authorId: owner,
        project: fixture.project,
        messageIds: fixture.messages.map((m) => m.id),
        target: { kind: 'new', ownerId: owner },
      },
    },
    messages: fixture.messages,
    clarifications: [],
    selectedPost: null,
    selectedCandidate: null,
    memories: [],
    pendingRequests: [],
  }
  try {
    const draft = await Effect.runPromise(
      reviewedPost(
        {
          progress: () => Effect.void,
          readTool: (_scope, name) =>
            Effect.succeed(
              name === 'searchPosts' ? { items: [], nextCursor: null } : fixture.messages,
            ),
          model: (request) =>
            Effect.gen(function* () {
              if (request.task === 'evidence')
                for (const page of fixture.pages ?? [])
                  yield* request.observe({
                    kind: 'native-tool',
                    name: 'read_url_content',
                    input: { Url: page.url },
                    output: { provenance: 'pi-web-v1', status: 'success', pages: [page] },
                  })
              const observations: unknown[] = []
              const output = yield* piOpenRouter({
                ...request,
                input: { ...(request.input as object), suppliedFixturePages: fixture.pages ?? [] },
                observe: (observation) =>
                  request.observe(observation).pipe(
                    Effect.tap(() =>
                      Effect.sync(() => {
                        observations.push(observation)
                      }),
                    ),
                  ),
              })
              calls.push({
                task: request.task,
                instruction: request.instruction,
                input: request.input,
                output,
                observations,
              })
              return output
            }),
        },
        context,
      ),
    )
    results.push({ id: fixture.id, fixture, expected: fixture.expected, draft, calls })
    console.log(`${fixture.id}: approved`)
  } catch (error) {
    results.push({ id: fixture.id, fixture, error: String(error), calls })
    console.log(`${fixture.id}: failed`)
  }
  await writeFile(outputPath, JSON.stringify(results, null, 2))
}
if (results.some((result) => 'error' in (result as object))) process.exitCode = 1
