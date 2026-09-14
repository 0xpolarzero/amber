import { Effect } from 'effect'
import { expect, it } from 'vitest'
import { groupSelection } from '../grouping'
import type { ModelPorts } from '../model'
import type * as S from '../schemas'

const batch: typeof S.BatchContext.Type = {
  batchId: 'grouping',
  groupId: 'makers',
  messages: [
    { id: '1', authorId: 'maya', text: 'I built an eval website.', replyToId: null, albumId: null },
    {
      id: '2',
      authorId: 'maya',
      text: 'I built its UI in Storybook.',
      replyToId: '1',
      albumId: null,
    },
    { id: '3', authorId: 'liam', text: 'I built a separate app.', replyToId: null, albumId: null },
  ],
  newMessageIds: ['1', '2', '3'],
  associations: [{ messageId: '3', targetId: 'saved', targetKind: 'post', ownerId: 'liam' }],
}
const selection: typeof S.Selection.Type = {
  candidates: [
    {
      authorId: 'maya',
      project: 'Eval site',
      messageIds: ['1'],
      target: { kind: 'new', ownerId: 'maya' },
    },
    {
      authorId: 'maya',
      project: 'Storybook UI',
      messageIds: ['2'],
      target: { kind: 'new', ownerId: 'maya' },
    },
    {
      authorId: 'liam',
      project: 'Separate app',
      messageIds: ['3'],
      target: { kind: 'new', ownerId: 'liam' },
    },
  ],
  ignored: [],
  unresolved: [],
  lookedUpProjects: [],
}
const group = (...indexes: number[]) => ({
  indexes,
  project: 'Eval website',
  reason: 'The UI explains the same website.',
})
function ports(groups: ReturnType<typeof group>[]): ModelPorts {
  return {
    model: (request) => {
      expect(request.task).toBe('grouping')
      expect(request.tools).toEqual([])
      expect(request.nativeTools).toEqual([])
      expect(request.input).toEqual({ ...batch, selection: expect.any(Object) })
      return Effect.succeed({ groups })
    },
    progress: () => Effect.void,
    readTool: () => Effect.die('Grouping must not read tools'),
  }
}

it('merges website and build fragments while preserving every message and unrelated candidate', async () => {
  const result = await Effect.runPromise(
    groupSelection(ports([group(0, 1), group(2)]), batch, selection),
  )
  expect(result.candidates).toEqual([
    { ...selection.candidates[0], project: 'Eval website', messageIds: ['1', '2'] },
    selection.candidates[2],
  ])
  expect(result.ignored).toEqual(selection.ignored)
  expect(result.lookedUpProjects).toEqual(selection.lookedUpProjects)
})

it('preserves independently usable projects from the same owner without rewriting singletons', async () => {
  const result = await Effect.runPromise(
    groupSelection(ports([group(2), group(1), group(0)]), batch, selection),
  )
  expect(result).toEqual(selection)
})

it.each([
  ['missing', [group(0), group(2)]],
  ['duplicate', [group(0), group(1), group(1)]],
  ['invented', [group(0), group(1), group(3)]],
  ['cross-owner', [group(0, 2), group(1)]],
] as const)('rejects %s indexes instead of returning candidates to publish', async (_, groups) => {
  await expect(
    Effect.runPromise(groupSelection(ports([...groups]), batch, selection)),
  ).rejects.toThrow()
})

it('rejects merging an existing target and preserves it when left alone', async () => {
  const input = {
    ...selection,
    candidates: selection.candidates.map((candidate, index) =>
      index === 2
        ? { ...candidate, target: { kind: 'existing' as const, targetId: 'saved' } }
        : candidate,
    ),
  }
  await expect(
    Effect.runPromise(groupSelection(ports([group(0, 1, 2)]), batch, input)),
  ).rejects.toThrow('Only new candidates')
  const result = await Effect.runPromise(
    groupSelection(ports([group(0, 1), group(2)]), batch, input),
  )
  expect(result.candidates[1]).toEqual(input.candidates[2])
})

it('makes no model call when each owner has at most one new candidate', async () => {
  const input = {
    ...selection,
    candidates: [selection.candidates[0], selection.candidates[2]],
    ignored: [{ messageId: '2', category: 'chatter' as const, reason: 'No second candidate.' }],
  }
  const host: ModelPorts = { ...ports([]), model: () => Effect.die('Grouping unnecessary') }
  expect(await Effect.runPromise(groupSelection(host, batch, input))).toBe(input)
})
