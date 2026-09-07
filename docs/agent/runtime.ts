import * as Action from '@smthrs/flow/Action'
import * as Interpreter from '@smthrs/flow/Interpreter'
import { Effect, Layer } from 'effect'
import * as C from './chat.workflow'
import * as S from './schemas'
import { validateChanges } from './guards'
import { checked, createModelTasks } from './model'
import { telegramLayers } from './telegram.agents'
import type { Ports } from './tools'
import queryPrompt from './prompts/query-planner'
import replyPrompt from './prompts/reply'
import memoryPrompt from './prompts/memory'
import resolutionPrompt from './prompts/resolution'

const webTools = ['searchWeb', 'readPage'] as const

export function layers(ports: Ports) {
  const { track, generate } = createModelTasks(ports)
  return Layer.mergeAll(
    C.LoadOpening.toLayer(ports.loadOpening),
    C.PlanQueries.toLayer((input) =>
      track(
        'query-planner',
        {},
        generate(S.Queries, 'query-planner', queryPrompt, input, {}).pipe(
          Effect.map((result) => result.value),
        ),
      ),
    ),
    C.ReadContext.toLayer(ports.readContext),
    C.WriteAnswer.toLayer((input) =>
      track(
        'reply',
        { userId: input.userId },
        generate(S.Answer, 'reply', replyPrompt, input, { userId: input.userId }, webTools).pipe(
          Effect.map((result) => result.value),
        ),
      ),
    ),
    C.Publish.toLayer((input) =>
      checked('post-changes', () => {
        validateChanges(input.turn.userId, input.context, input.answer)
        return input
      }).pipe(Effect.flatMap(ports.publish)),
    ),
    C.ReadMemories.toLayer(ports.readMemories),
    C.UpdateMemory.toLayer((input) =>
      track(
        'memory',
        {},
        generate(S.MemoryChanges, 'memory', memoryPrompt, input, {}).pipe(
          Effect.flatMap(({ value }) =>
            checked('memory-changes', () => {
              const ids = new Set<string>()
              for (const change of value.changes) {
                if (!input.message.text.includes(change.evidence))
                  throw new Error('Memory needs user evidence.')
                if (change.kind !== 'create') {
                  if (
                    ids.has(change.id) ||
                    !input.memories.some((memory) => memory.id === change.id)
                  )
                    throw new Error('Change only distinct, supplied memory IDs.')
                  ids.add(change.id)
                }
              }
              return value
            }),
          ),
        ),
      ),
    ),
    C.SaveMemories.toLayer(ports.saveMemories),
    C.ResolveMessages.toLayer((input) =>
      track(
        'resolution',
        {},
        generate(S.Resolutions, 'resolution', resolutionPrompt, input, {}).pipe(
          Effect.flatMap(({ value }) =>
            checked('resolution-candidates', () => {
              const ids = value.resolutions.map((item) => item.messageId)
              if (
                new Set(ids).size !== ids.length ||
                ids.some((id) => !input.unaddressed.some((m) => m.id === id))
              )
                throw new Error('Resolve only distinct, supplied outstanding messages.')
              return value
            }),
          ),
        ),
      ),
    ),
    C.SaveResolutions.toLayer(ports.saveResolutions),
    C.QueueMaintenanceRetry.toLayer(ports.queueMaintenanceRetry),
    C.FinishTurn.toLayer(ports.finishTurn),
    Interpreter.layer(C.AgentTurn),
    Interpreter.layer(C.RetryMaintenance),
    telegramLayers(ports),
  ).pipe(Layer.provideMerge(Action.layerImplementations))
}
