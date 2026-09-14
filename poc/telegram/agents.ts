import * as Interpreter from '@smthrs/flow/Interpreter'
import { Effect, Layer } from 'effect'
import { groupSelection } from './grouping'
import { validateSelection } from './guards'
import { checked, createModelTasks } from './model'
import selectionPrompt from './prompts/selection.mdx?raw'
import { reviewedPost } from './quality'
import * as S from './schemas'
import type { Ports } from './tools'
import * as T from './workflow'

const selectorTools = ['searchPosts'] as const

export function telegramLayers(ports: Ports) {
  const { track, generate } = createModelTasks(ports)
  return Layer.mergeAll(
    T.LoadBatch.toLayer(ports.loadBatch),
    T.SelectProjects.toLayer((input) =>
      track(
        'selection',
        { batchId: input.batchId, groupId: input.groupId },
        generate(
          S.ModelSelection,
          'selection',
          selectionPrompt,
          input,
          { batchId: input.batchId, groupId: input.groupId },
          selectorTools,
          [],
          (value, evidence) =>
            validateSelection(input, { ...value, lookedUpProjects: evidence.projects }),
        ).pipe(
          Effect.flatMap(({ value, evidence }) =>
            checked('selection-evidence', () => {
              const selection = { ...value, lookedUpProjects: evidence.projects }
              validateSelection(input, selection)
              return selection
            }),
          ),
          Effect.flatMap((selection) => groupSelection(ports, input, selection)),
        ),
      ),
    ),
    T.QueueProjects.toLayer(ports.queueProjects),
    T.LoadProject.toLayer(ports.loadProject),
    T.WritePost.toLayer((input) => reviewedPost(ports, input)),
    T.PublishProject.toLayer(ports.publishProject),
    T.QueueProjectRetry.toLayer(ports.queueProjectRetry),
    T.FinishBatch.toLayer(ports.finishBatch),
    Interpreter.layer(T.TelegramBatch),
    Interpreter.layer(T.BuildProjects),
    Interpreter.layer(T.Project),
  )
}
