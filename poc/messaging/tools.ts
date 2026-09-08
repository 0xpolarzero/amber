import type { Effect } from 'effect'
import type { Model, ModelObservation } from '../shared/runtime'
import type * as S from './schemas'
import type * as T from './workflow'

export type Run<A> = Effect.Effect<A, S.Failure>
type Handler<A extends { payloadSchema: { Type: unknown }; successSchema: { Type: unknown } }> = (
  input: A['payloadSchema']['Type'],
) => Run<A['successSchema']['Type']>

export type ProgressEvent = {
  turnId: string
  userId: string
  task: 'planner' | 'responder' | 'memory' | 'addressing'
  status: 'running' | 'done' | 'failed'
}

export type Ports = {
  model: Model
  observe: (task: string, observation: ModelObservation) => Run<void>
  progress: (event: ProgressEvent) => Run<void>
  admitTurn: Handler<typeof T.AdmitTurn>
  executeQueries: Handler<typeof T.ExecuteQueries>
  publishResponse: Handler<typeof T.PublishResponse>
  abortTurn: Handler<typeof T.AbortTurn>
  loadBackgroundJob: Handler<typeof T.LoadBackgroundJob>
  applyMemory: Handler<typeof T.ApplyMemory>
  applyAddressing: Handler<typeof T.ApplyAddressing>
  recordBackgroundFailure: Handler<typeof T.RecordBackgroundFailure>
  finalizeTurn: Handler<typeof T.FinalizeTurn>
  loadRetry: Handler<typeof T.LoadRetry>
}
