import * as Interpreter from '@smthrs/flow/Interpreter'
import { Effect, Layer } from 'effect'
import { validateResponse } from './guards'
import { modelTasks } from './model'
import addressingPrompt from './prompts/addressing.mdx?raw'
import memoryPrompt from './prompts/memory.mdx?raw'
import plannerPrompt from './prompts/query-planner.mdx?raw'
import responderPrompt from './prompts/responder.mdx?raw'
import * as S from './schemas'
import type { Ports } from './tools'
import * as T from './workflow'

export function messagingLayers(ports: Ports) {
  const { generate, track } = modelTasks(ports)
  const event = (published: typeof S.PublishedTurn.Type, task: 'memory' | 'addressing') => ({
    turnId: published.turn.turnId,
    userId: published.turn.userId,
    task,
  })
  return Layer.mergeAll(
    T.AdmitTurn.toLayer(ports.admitTurn),
    T.LoadAdmittedTurn.toLayer((admission) =>
      Effect.try({
        try: () => {
          if (admission.result.kind !== 'admitted') throw new Error('Turn was not admitted.')
          return admission.result.context
        },
        catch: (error) =>
          new S.Failure({ operation: 'load-admitted-turn', message: String(error) }),
      }),
    ),
    T.ReadAdmissionReceipt.toLayer((admission) =>
      Effect.try({
        try: () => {
          if (admission.result.kind === 'admitted')
            throw new Error('Admitted turn has no saved receipt.')
          return admission.result.receipt
        },
        catch: (error) =>
          new S.Failure({ operation: 'read-admission-receipt', message: String(error) }),
      }),
    ),
    T.PlanQueries.toLayer((context) =>
      track(
        { turnId: context.turn.turnId, userId: context.turn.userId, task: 'planner' },
        generate(S.QueryPlan, 'query-planner', plannerPrompt, context).pipe(
          Effect.map(({ value }) => value),
        ),
      ),
    ),
    T.ExecuteQueries.toLayer(ports.executeQueries),
    T.Respond.toLayer((context) =>
      track(
        { turnId: context.turn.turnId, userId: context.turn.userId, task: 'responder' },
        generate(S.Response, 'responder', responderPrompt, context, [
          'search_web',
          'read_url_content',
        ]).pipe(
          Effect.flatMap(({ value, pages }) =>
            Effect.try({
              try: () => {
                const result = { response: value, webEvidence: pages }
                validateResponse(context, result)
                return result
              },
              catch: (error) =>
                new S.Failure({ operation: 'response-evidence', message: String(error) }),
            }),
          ),
        ),
      ),
    ),
    T.PublishResponse.toLayer(ports.publishResponse),
    T.AbortTurn.toLayer(ports.abortTurn),
    T.LoadBackgroundJob.toLayer(ports.loadBackgroundJob),
    T.Remember.toLayer((job) => {
      const { published } = job
      return track(
        event(published, 'memory'),
        generate(S.MemoryPlan, 'memory', memoryPrompt, {
          userMessage: published.userMessage,
          assistantAnswer: published.assistantMessage,
          memories: published.memorySnapshot,
        }).pipe(Effect.map(({ value }) => value)),
      )
    }),
    T.Address.toLayer((job) => {
      const { published } = job
      return track(
        event(published, 'addressing'),
        generate(S.AddressingPlan, 'addressing', addressingPrompt, {
          userMessage: published.userMessage,
          assistantAnswer: published.assistantMessage,
          unaddressedSnapshot: published.requestSnapshot,
        }).pipe(Effect.map(({ value }) => value)),
      )
    }),
    T.ApplyMemory.toLayer(ports.applyMemory),
    T.ApplyAddressing.toLayer(ports.applyAddressing),
    T.ReuseBackgroundJob.toLayer((job) =>
      Effect.try({
        try: () => {
          if (!job.skip || !job.receipt || job.receipt.status !== 'done')
            throw new Error('Background job has no successful receipt to reuse.')
          return job.receipt
        },
        catch: (error) =>
          new S.Failure({ operation: 'reuse-background-job', message: String(error) }),
      }),
    ),
    T.RecordBackgroundFailure.toLayer(ports.recordBackgroundFailure),
    T.FinalizeTurn.toLayer(ports.finalizeTurn),
    T.LoadRetry.toLayer(ports.loadRetry),
    Interpreter.layer(T.MessagingTurn),
    Interpreter.layer(T.RetryBackground),
    Interpreter.layer(T.Background),
    Interpreter.layer(T.AdmittedTurn),
    Interpreter.layer(T.MemoryJob),
    Interpreter.layer(T.AddressingJob),
  )
}
