/** All model tools are read-only. Database writes are application actions below. */
import { type Effect, Schema } from 'effect'
import * as S from './schemas'
import type * as T from './workflow'

const Query = Schema.Struct({
  query: Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240)),
})
export const tools = {
  searchMessages: {
    description:
      'Search stored Telegram messages in this candidate’s group, up to the batch cutoff.',
    input: Query,
    output: Schema.Array(S.TelegramMessage).check(Schema.isMaxLength(20)),
  },
  readMessages: {
    description: 'Read exact Telegram message IDs from this candidate’s group and cutoff.',
    input: Schema.Struct({ ids: Schema.Array(S.Id).check(Schema.isMaxLength(20)) }),
    output: Schema.Array(S.TelegramMessage).check(Schema.isMaxLength(20)),
  },
  searchPosts: {
    description: 'Search existing posts owned by the candidate author to avoid duplicate projects.',
    input: Query,
    output: Schema.Array(S.Post).check(Schema.isMaxLength(10)),
  },
} as const
export type ToolName = keyof typeof tools
export type NativeToolName = 'search_web' | 'read_url_content'
export type ModelObservation =
  | {
      kind: 'configuration'
      agent: string
      model: string
      declaredTools: readonly string[]
      runtimeInventory: readonly string[]
    }
  | {
      kind: 'native-tool'
      name: NativeToolName
      input: unknown
      output: unknown
    }
export type Scope = { userId?: string; batchId?: string; groupId?: string }
export type Run<A> = Effect.Effect<A, S.Failure>
type Handler<A extends { payloadSchema: { Type: unknown }; successSchema: { Type: unknown } }> = (
  input: A['payloadSchema']['Type'],
) => Run<A['successSchema']['Type']>

export type Ports = {
  // Fresh subscription-backed model call with an explicit custom-agent allowlist. The adapter
  // disables inherited user customizations and adds a PreToolUse deny hook. Antigravity still
  // supplies provider/runtime instructions which the application cannot inspect or replace.
  // https://www.antigravity.google/docs/subagents/
  // Bound task duration/output and model concurrency (initially two globally). Cancel
  // the CLI process when its Effect scope ends. Provider/model ID is configuration.
  model: (request: {
    task: string
    instruction: string
    input: unknown
    outputSchema: unknown
    tools: readonly { name: ToolName; description: string; inputSchema: unknown }[]
    nativeTools: readonly NativeToolName[]
    callTool: (name: string, input: unknown) => Run<unknown>
    observe: (observation: ModelObservation) => Run<void>
  }) => Run<unknown>
  // Enforce scope here, outside model control. Parameterized database reads; bounded results.
  // Preserve actual source IDs/final URLs and journal tool observations for audit.
  // A successful search is not proof of ownership.
  readTool: (scope: Scope, name: ToolName, input: unknown) => Run<unknown>
  // Durable status projection keyed by execution + task + attempt; sanitized errors only.
  // UI receives status, timing, tool names and public sources, never private reasoning.
  progress: (event: {
    scope: Scope
    task: string
    status: 'running' | 'done' | 'failed'
  }) => Run<void>

  // TELEGRAM ADMISSION: one GramJS reader per group. Save raw messages, cursor and batch
  // outbox job in ONE transaction before acknowledging a page.
  // Keep immutable batch snapshots + reply/album context; separate new IDs from old context.
  loadBatch: Handler<typeof T.LoadBatch>
  // Persist selection + ignored reasons. Assign stable candidate IDs once (batchId + ordinal).
  // Retries return the saved list. Never let the model assign job IDs or authenticated owners.
  queueProjects: Handler<typeof T.QueueProjects>
  // Load candidate evidence, replied-to/album messages, current author's posts, all their
  // memories, outstanding requests and linked user clarifications. Re-read on a failed candidate's next attempt.
  loadProject: Handler<typeof T.LoadProject>
  // Transaction under the author's write lock, shared with chat publication. Wait behind an
  // active chat turn. Check existing post version; on conflict re-read and regenerate.
  // Unique (candidateId, revision) receipt makes replay harmless; exact source/project identity prevents
  // duplicate publication across overlapping batches. Similarity alone is not a unique key.
  // Save post + source associations + actual diff + optional unaddressed Agent message together.
  // question saves a pending candidate + linked Agent message; skip records its reason. Unclaimed Telegram authors
  // retain their stable person ID and receive their conversation when they authenticate later.
  // An unresolved identity match retries for review; it must not create a speculative duplicate.
  publishProject: Handler<typeof T.PublishProject>
  // Isolate failure to this candidate; other children continue. Retry Project with saved work
  // and a new attempt execution ID. Successful candidate receipts are never republished.
  queueProjectRetry: Handler<typeof T.QueueProjectRetry>
  // Reconcile durable candidate receipts; retry is pending, not processed. Candidate publication
  // also reconciles the batch so the final retry can finish it without rerunning selection.
  finishBatch: Handler<typeof T.FinishBatch>
}
