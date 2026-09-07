import * as Action from '@smthrs/flow/Action'
import * as Flow from '@smthrs/flow/Flow'
import * as Node from '@smthrs/plan/Node'
import { Schema } from 'effect'
import * as S from './schemas'

export const LoadOpening = Action.make('amber/load-opening', {
  payload: S.Turn,
  success: S.Opening,
  error: S.Failure,
})
export const PlanQueries = Action.make('amber/plan-queries', {
  payload: S.Opening,
  success: S.Queries,
  error: S.Failure,
})
export const ReadContext = Action.make('amber/read-context', {
  payload: { turn: S.Turn, opening: S.Opening, plan: S.Queries },
  success: S.Context,
  error: S.Failure,
})
export const WriteAnswer = Action.make('amber/write-answer', {
  payload: S.Context,
  success: S.Answer,
  error: S.Failure,
})
export const Publish = Action.make('amber/publish', {
  payload: { turn: S.Turn, context: S.Context, answer: S.Answer },
  success: S.Published,
  error: S.Failure,
})
export const ReadMemories = Action.make('amber/read-memories', {
  payload: S.Turn,
  success: Schema.Struct({ memories: Schema.Array(S.Memory), version: S.Version }),
  error: S.Failure,
})
export const UpdateMemory = Action.make('amber/update-memory', {
  payload: { message: S.Message, answer: S.Published, memories: Schema.Array(S.Memory) },
  success: S.MemoryChanges,
  error: S.Failure,
})
export const SaveMemories = Action.make('amber/save-memories', {
  payload: { turn: S.Turn, expectedVersion: S.Version, proposal: S.MemoryChanges },
  success: S.Receipt,
  error: S.Failure,
})
export const ResolveMessages = Action.make('amber/resolve-messages', {
  payload: { message: S.Message, answer: S.Published, unaddressed: Schema.Array(S.Message) },
  success: S.Resolutions,
  error: S.Failure,
})
export const SaveResolutions = Action.make('amber/save-resolutions', {
  payload: { turn: S.Turn, candidates: Schema.Array(S.Message), proposal: S.Resolutions },
  success: S.Receipt,
  error: S.Failure,
})
export const RetryInput = Schema.Struct({ ...S.Maintenance.fields, branch: S.Branch })
export const QueueMaintenanceRetry = Action.make('amber/queue-maintenance-retry', {
  payload: { input: RetryInput, failure: S.Failure },
  success: S.Receipt,
  error: S.Failure,
})
export const FinishTurn = Action.make('amber/finish-turn', {
  payload: S.Turn,
  success: S.Receipt,
  error: S.Failure,
})

// Each branch catches its own failure so its sibling can finish. A queued retry
// is NOT completion: FinishTurn keeps the conversation locked until both writes commit.
const recover = (input: Action.PlannedPayload<typeof RetryInput.Type>) =>
  Node.catch({
    error: S.Failure,
    onFailure: (failure) => QueueMaintenanceRetry.call({ input, failure }),
  })
const memory = (input: Action.PlannedPayload<typeof S.Maintenance.Type>) =>
  ReadMemories.call(input.turn).pipe(
    Node.bindPlanned((snapshot) =>
      UpdateMemory.call({
        message: input.context.message,
        answer: input.answer,
        memories: snapshot.memories,
      }).pipe(
        Node.bindPlanned((proposal) =>
          SaveMemories.call({
            turn: input.turn,
            expectedVersion: snapshot.version,
            proposal,
          }),
        ),
      ),
    ),
    recover({ turn: input.turn, context: input.context, answer: input.answer, branch: 'memory' }),
  )
const resolution = (input: Action.PlannedPayload<typeof S.Maintenance.Type>) =>
  ResolveMessages.call({
    message: input.context.message,
    answer: input.answer,
    unaddressed: input.context.unaddressed,
  }).pipe(
    Node.bindPlanned((proposal) =>
      SaveResolutions.call({
        turn: input.turn,
        candidates: input.context.unaddressed,
        proposal,
      }),
    ),
    recover({
      turn: input.turn,
      context: input.context,
      answer: input.answer,
      branch: 'resolution',
    }),
  )

export const AgentTurn = Flow.make('amber/agent-turn', {
  payload: S.Turn,
  success: S.Receipt,
  error: S.Failure,
  body: (turn) =>
    LoadOpening.call(turn).pipe(
      Node.bindPlanned((opening) =>
        PlanQueries.call(opening).pipe(
          Node.bindPlanned((plan) => ReadContext.call({ turn, opening, plan })),
        ),
      ),
      Node.bindPlanned((context) =>
        WriteAnswer.call(context).pipe(
          Node.bindPlanned((answer) => Publish.call({ turn, context, answer })),
          Node.bindPlanned((answer) =>
            Node.all({
              memory: memory({ turn, context, answer }),
              resolution: resolution({ turn, context, answer }),
            }),
          ),
        ),
      ),
      Node.andThen(FinishTurn.call(turn)),
    ),
})

// The durable queue passes the saved branch input and a new attempt execution ID.
// Successful writes remain idempotent under (messageId, branch), across attempts.
export const RetryMaintenance = Flow.make('amber/retry-maintenance', {
  payload: RetryInput,
  success: S.Receipt,
  error: S.Failure,
  body: (input) =>
    Node.succeed(input).pipe(
      Node.branch({
        if: (value: typeof RetryInput.Type) => value.branch === 'memory',
        then: memory,
        else: resolution,
      }),
      Node.andThen(FinishTurn.call(input.turn)),
    ),
})
