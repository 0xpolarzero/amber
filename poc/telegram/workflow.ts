import * as Action from '@smthrs/flow/Action'
import * as Flow from '@smthrs/flow/Flow'
import * as Node from '@smthrs/plan/Node'
import { Schema } from 'effect'
import * as S from './schemas'

export const LoadBatch = Action.make('amber/load-batch', {
  payload: S.Batch,
  success: S.BatchContext,
  error: S.Failure,
})
export const SelectProjects = Action.make('amber/select-projects', {
  payload: S.BatchContext,
  success: S.Selection,
  error: S.Failure,
})
const Work = Schema.Struct({ batch: S.Batch, items: Schema.Array(S.WorkItem) })
export const QueueProjects = Action.make('amber/queue-projects', {
  payload: { batch: S.BatchContext, selection: S.Selection },
  success: Work,
  error: S.Failure,
})
export const LoadProject = Action.make('amber/load-project', {
  payload: S.WorkItem,
  success: S.ProjectContext,
  error: S.Failure,
})
export const WritePost = Action.make('amber/write-post', {
  payload: S.ProjectContext,
  success: S.Draft,
  error: S.Failure,
})
export const PublishProject = Action.make('amber/publish-project', {
  payload: { context: S.ProjectContext, draft: S.Draft },
  success: S.ProjectResult,
  error: S.Failure,
})
export const QueueProjectRetry = Action.make('amber/queue-project-retry', {
  payload: { work: S.WorkItem, failure: S.Failure },
  success: S.ProjectResult,
  error: S.Failure,
})
export const FinishBatch = Action.make('amber/finish-batch', {
  payload: { batch: S.Batch, results: Schema.Record(Schema.String, S.ProjectResult) },
  success: S.Receipt,
  error: S.Failure,
})

export const Project = Flow.make('amber/project', {
  payload: S.WorkItem,
  success: S.ProjectResult,
  error: S.Failure,
  body: (work) =>
    LoadProject.call(work).pipe(
      Node.bindPlanned((context) =>
        WritePost.call(context).pipe(
          Node.bindPlanned((draft) => PublishProject.call({ context, draft })),
        ),
      ),
      Node.catch({
        error: S.Failure,
        onFailure: (failure) => QueueProjectRetry.call({ work, failure }),
      }),
    ),
})

// The previous round resolved this array. Mapping a symbolic action result inside
// bindPlanned would be invalid. Each real item now gets an attached child run.
export const BuildProjects = Flow.make('amber/build-projects', {
  payload: Work,
  success: S.Receipt,
  error: S.Failure,
  body: ({ batch, items }) =>
    Node.all(Object.fromEntries(items.map((work) => [work.candidateId, Project.child(work)]))).pipe(
      Node.bindPlanned((results) => FinishBatch.call({ batch, results })),
    ),
})

export const TelegramBatch = Flow.make('amber/telegram-batch', {
  payload: S.Batch,
  success: S.Receipt,
  error: S.Failure,
  maxRounds: 2,
  body: (batch) =>
    LoadBatch.call(batch).pipe(
      Node.bindPlanned((context) =>
        SelectProjects.call(context).pipe(
          Node.bindPlanned((selection) => QueueProjects.call({ batch: context, selection })),
        ),
      ),
      Node.bindPlanned((work) => BuildProjects.to(work)),
    ),
})
