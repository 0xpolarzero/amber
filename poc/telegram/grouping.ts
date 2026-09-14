import { Effect, Schema } from 'effect'
import { validateSelection } from './guards'
import { checked, createModelTasks, type ModelPorts } from './model'
import groupingPrompt from './prompts/grouping.mdx?raw'
import type * as S from './schemas'

const text = (max: number) => Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(max))
export const Groups = Schema.Struct({
  groups: Schema.Array(
    Schema.Struct({
      indexes: Schema.Array(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))).check(
        Schema.isMinLength(1),
      ),
      project: text(140),
      reason: text(400),
    }),
  ).check(Schema.isMaxLength(100)),
})

function applyGroups(selection: typeof S.Selection.Type, result: typeof Groups.Type) {
  const indexes = result.groups.flatMap((group) => group.indexes)
  if (
    indexes.length !== selection.candidates.length ||
    new Set(indexes).size !== indexes.length ||
    indexes.some((index) => !selection.candidates[index])
  )
    throw new Error('Grouping must partition every candidate index exactly once.')
  return {
    ...selection,
    candidates: [...result.groups]
      .sort((a, b) => Math.min(...a.indexes) - Math.min(...b.indexes))
      .map((group) => {
        const candidates = group.indexes.map((index) => selection.candidates[index])
        const first = candidates[0]
        if (candidates.length === 1) return first
        const target = first.target
        if (
          target.kind !== 'new' ||
          candidates.some(
            (candidate) =>
              candidate.target.kind !== 'new' || candidate.target.ownerId !== target.ownerId,
          )
        )
          throw new Error('Only new candidates from the same owner may be merged.')
        return {
          ...first,
          project: group.project,
          messageIds: [...new Set(candidates.flatMap((candidate) => candidate.messageIds))],
        }
      }),
  }
}

export function groupSelection(
  ports: ModelPorts,
  batch: typeof S.BatchContext.Type,
  selection: typeof S.Selection.Type,
) {
  const owners = selection.candidates.flatMap((candidate) =>
    candidate.target.kind === 'new' ? [candidate.target.ownerId] : [],
  )
  if (new Set(owners).size === owners.length) return Effect.succeed(selection)
  const { track, generate } = createModelTasks(ports)
  const scope = { batchId: batch.batchId, groupId: batch.groupId }
  const apply = (value: typeof Groups.Type) => {
    const grouped = applyGroups(selection, value)
    validateSelection(batch, grouped)
    return grouped
  }
  return track(
    'grouping',
    scope,
    generate(
      Groups,
      'grouping',
      groupingPrompt,
      { ...batch, selection },
      scope,
      [],
      [],
      apply,
    ).pipe(Effect.flatMap(({ value }) => checked('grouping-partition', () => apply(value)))),
  )
}
