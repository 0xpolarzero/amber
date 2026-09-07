import * as Interpreter from '@smthrs/flow/Interpreter'
import { Effect, Layer } from 'effect'
import { validateDraft, validateSelection } from './guards'
import { checked, createModelTasks } from './model'
import postPrompt from './prompts/post.mdx?raw'
import selectionPrompt from './prompts/selection.mdx?raw'
import * as S from './schemas'
import type { Ports } from './tools'
import * as T from './workflow'

const projectTools = [
  'searchWeb',
  'readPage',
  'searchMessages',
  'readMessages',
  'searchPosts',
] as const

export function telegramLayers(ports: Ports) {
  const { track, generate } = createModelTasks(ports)
  return Layer.mergeAll(
    T.LoadBatch.toLayer(ports.loadBatch),
    T.SelectProjects.toLayer((input) =>
      track(
        'selection',
        { batchId: input.batchId, groupId: input.groupId },
        generate(S.Selection, 'selection', selectionPrompt, input, {}).pipe(
          Effect.flatMap(({ value }) =>
            checked('selection-evidence', () => {
              validateSelection(input, value)
              return value
            }),
          ),
        ),
      ),
    ),
    T.QueueProjects.toLayer(ports.queueProjects),
    T.LoadProject.toLayer(ports.loadProject),
    T.WritePost.toLayer((input) => {
      const scope = {
        userId: input.work.candidate.authorId,
        groupId: input.work.groupId,
        batchId: input.work.batchId,
      }
      return track(
        'post',
        scope,
        generate(S.Proposal, 'post', postPrompt, input, scope, projectTools).pipe(
          Effect.flatMap(({ value: proposal, evidence }) =>
            checked('project-evidence', () => {
              const draft = { proposal, evidence }
              validateDraft(input, draft)
              return draft
            }),
          ),
        ),
      )
    }),
    T.PublishProject.toLayer(ports.publishProject),
    T.QueueProjectRetry.toLayer(ports.queueProjectRetry),
    T.FinishBatch.toLayer(ports.finishBatch),
    Interpreter.layer(T.TelegramBatch),
    Interpreter.layer(T.BuildProjects),
    Interpreter.layer(T.Project),
  )
}
