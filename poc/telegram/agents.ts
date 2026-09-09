import * as Interpreter from '@smthrs/flow/Interpreter'
import { Effect, Layer } from 'effect'
import { validateDraft, validateSelection } from './guards'
import { checked, createModelTasks } from './model'
import postPrompt from './prompts/post.mdx?raw'
import selectionPrompt from './prompts/selection.mdx?raw'
import * as S from './schemas'
import type { Ports } from './tools'
import * as T from './workflow'

const selectorTools = ['searchPosts'] as const
const projectTools = ['searchMessages', 'readMessages', 'searchPosts'] as const
const nativeWebTools = ['search_web', 'read_url_content'] as const

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
        ).pipe(
          Effect.flatMap(({ value, evidence }) =>
            checked('selection-evidence', () => {
              const selection = { ...value, lookedUpProjects: evidence.projects }
              validateSelection(input, selection)
              return selection
            }),
          ),
        ),
      ),
    ),
    T.QueueProjects.toLayer(ports.queueProjects),
    T.LoadProject.toLayer(ports.loadProject),
    T.WritePost.toLayer((input) => {
      const scope = {
        userId: input.work.ownerId,
        groupId: input.work.groupId,
        batchId: input.work.batchId,
      }
      const hasFetchableUrl = input.messages
        .flatMap(({ text }) => text.match(/https?:\/\/[^\s)]+/g) ?? [])
        .some((url) => URL.canParse(url) && !new URL(url).hostname.endsWith('.example'))
      const allowedProjectTools =
        input.work.candidate.target.kind === 'existing' ? projectTools : []
      return track(
        'post',
        scope,
        generate(
          S.Proposal,
          'post',
          postPrompt,
          input,
          scope,
          allowedProjectTools,
          hasFetchableUrl ? nativeWebTools : [],
        ).pipe(
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
