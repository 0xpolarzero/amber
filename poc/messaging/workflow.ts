import * as Action from '@smthrs/flow/Action'
import * as Flow from '@smthrs/flow/Flow'
import * as Node from '@smthrs/plan/Node'
import * as S from './schemas'

export const AdmitTurn = Action.make('amber/messaging/admit-turn', {
  payload: S.TurnInput,
  success: S.Admission,
  error: S.Failure,
})
export const LoadAdmittedTurn = Action.make('amber/messaging/load-admitted-turn', {
  payload: S.Admission,
  success: S.PlannerContext,
  error: S.Failure,
})
export const ReadAdmissionReceipt = Action.make('amber/messaging/read-admission-receipt', {
  payload: S.Admission,
  success: S.TurnReceipt,
  error: S.Failure,
})
export const PlanQueries = Action.make('amber/messaging/plan-queries', {
  payload: S.PlannerContext,
  success: S.QueryPlan,
  error: S.Failure,
})
export const ExecuteQueries = Action.make('amber/messaging/execute-queries', {
  payload: { context: S.PlannerContext, plan: S.QueryPlan },
  success: S.ResponderContext,
  error: S.Failure,
})
export const Respond = Action.make('amber/messaging/respond', {
  payload: S.ResponderContext,
  success: S.ResponderResult,
  error: S.Failure,
})
export const PublishResponse = Action.make('amber/messaging/publish-response', {
  payload: { context: S.ResponderContext, result: S.ResponderResult },
  success: S.PublishedTurn,
  error: S.Failure,
})
export const AbortTurn = Action.make('amber/messaging/abort-turn', {
  payload: { turn: S.Turn, failure: S.Failure },
  success: S.TurnReceipt,
  error: S.Failure,
})
export const LoadBackgroundJob = Action.make('amber/messaging/load-background-job', {
  payload: { published: S.PublishedTurn, task: S.BackgroundTask },
  success: S.BackgroundContext,
  error: S.Failure,
})
export const Remember = Action.make('amber/messaging/remember', {
  payload: S.BackgroundContext,
  success: S.MemoryPlan,
  error: S.Failure,
})
export const Address = Action.make('amber/messaging/address', {
  payload: S.BackgroundContext,
  success: S.AddressingPlan,
  error: S.Failure,
})
export const ApplyMemory = Action.make('amber/messaging/apply-memory', {
  payload: { job: S.BackgroundContext, plan: S.MemoryPlan },
  success: S.JobReceipt,
  error: S.Failure,
})
export const ApplyAddressing = Action.make('amber/messaging/apply-addressing', {
  payload: { job: S.BackgroundContext, plan: S.AddressingPlan },
  success: S.JobReceipt,
  error: S.Failure,
})
export const ReuseBackgroundJob = Action.make('amber/messaging/reuse-background-job', {
  payload: S.BackgroundContext,
  success: S.JobReceipt,
  error: S.Failure,
})
export const RecordBackgroundFailure = Action.make('amber/messaging/background-failure', {
  payload: { published: S.PublishedTurn, task: S.BackgroundTask, failure: S.Failure },
  success: S.JobReceipt,
  error: S.Failure,
})
export const FinalizeTurn = Action.make('amber/messaging/finalize-turn', {
  payload: { published: S.PublishedTurn, jobs: S.BackgroundJobs },
  success: S.TurnReceipt,
  error: S.Failure,
})
export const LoadRetry = Action.make('amber/messaging/load-retry', {
  payload: S.RetryInput,
  success: S.PublishedTurn,
  error: S.Failure,
})

export const MemoryJob = Flow.make('amber/messaging/memory-job', {
  payload: S.PublishedTurn,
  success: S.JobReceipt,
  error: S.Failure,
  body: (published) =>
    LoadBackgroundJob.call({ published, task: 'memory' }).pipe(
      Node.branch({
        if: (job) => job.skip,
        // biome-ignore lint/suspicious/noThenProperty: Smithers names this required branch arm `then`.
        then: (job) => ReuseBackgroundJob.call(job),
        else: (job) =>
          Remember.call(job).pipe(Node.bindPlanned((plan) => ApplyMemory.call({ job, plan }))),
      }),
      Node.catch({
        error: S.Failure,
        onFailure: (failure) =>
          RecordBackgroundFailure.call({ published, task: 'memory', failure }),
      }),
    ),
})

export const AddressingJob = Flow.make('amber/messaging/addressing-job', {
  payload: S.PublishedTurn,
  success: S.JobReceipt,
  error: S.Failure,
  body: (published) =>
    LoadBackgroundJob.call({ published, task: 'addressing' }).pipe(
      Node.branch({
        if: (job) => job.skip,
        // biome-ignore lint/suspicious/noThenProperty: Smithers names this required branch arm `then`.
        then: (job) => ReuseBackgroundJob.call(job),
        else: (job) =>
          Address.call(job).pipe(Node.bindPlanned((plan) => ApplyAddressing.call({ job, plan }))),
      }),
      Node.catch({
        error: S.Failure,
        onFailure: (failure) =>
          RecordBackgroundFailure.call({ published, task: 'addressing', failure }),
      }),
    ),
})

export const AdmittedTurn = Flow.make('amber/messaging/admitted-turn', {
  payload: S.PlannerContext,
  success: S.TurnReceipt,
  error: S.Failure,
  maxRounds: 4,
  body: (context) =>
    PlanQueries.call(context).pipe(
      Node.bindPlanned((plan) => ExecuteQueries.call({ context, plan })),
      Node.bindPlanned((responderContext) =>
        Respond.call(responderContext).pipe(
          Node.bindPlanned((result) => PublishResponse.call({ context: responderContext, result })),
        ),
      ),
      Node.bindPlanned((published) => Background.to(published)),
      Node.catch({
        error: S.Failure,
        onFailure: (failure) => AbortTurn.call({ turn: context.turn, failure }),
      }),
    ),
})

export const Background = Flow.make('amber/messaging/background', {
  payload: S.PublishedTurn,
  success: S.TurnReceipt,
  error: S.Failure,
  body: (published) =>
    Node.all({
      memory: MemoryJob.child(published),
      addressing: AddressingJob.child(published),
    }).pipe(Node.bindPlanned((jobs) => FinalizeTurn.call({ published, jobs }))),
})

export const MessagingTurn = Flow.make('amber/messaging/turn', {
  payload: S.TurnInput,
  success: S.TurnReceipt,
  error: S.Failure,
  maxRounds: 4,
  body: (turn) =>
    AdmitTurn.call(turn).pipe(
      Node.branch({
        if: (admission) => admission.result.kind === 'admitted',
        // biome-ignore lint/suspicious/noThenProperty: Smithers names this required branch arm `then`.
        then: (admission) =>
          LoadAdmittedTurn.call(admission).pipe(
            Node.bindPlanned((context) => AdmittedTurn.child(context)),
          ),
        else: (admission) => ReadAdmissionReceipt.call(admission),
      }),
    ),
})

export const RetryBackground = Flow.make('amber/messaging/retry-background', {
  payload: S.RetryInput,
  success: S.TurnReceipt,
  error: S.Failure,
  maxRounds: 3,
  body: (input) =>
    LoadRetry.call(input).pipe(Node.bindPlanned((published) => Background.to(published))),
})
