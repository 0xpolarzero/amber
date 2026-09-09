import { describe, expect, it } from 'vitest'
import historical from '../../poc/messaging/result.json'
import {
  type HistoricalMessagingCapture,
  projectHistoricalTurn,
} from '../../poc/preview-projection'
import projection from '../../src/preview/generated/amber-real-preview'
import {
  createPreviewState,
  isAgentBusy,
  isUnaddressed,
  type PreviewState,
  previewReducer,
} from '../../src/preview/state'
import fixtures from '../../src/server/fixtures.json'

const scenario = (id: Parameters<typeof createPreviewState>[1]) =>
  createPreviewState(fixtures, id)

function tick(state: PreviewState) {
  const run = state.agentByUser.alex.run
  if (!run) throw new Error('Expected a replay run')
  return previewReducer(state, {
    type: 'advanceRun',
    userId: 'alex',
    messageId: run.messageId,
    stage: run.stage,
    memory: run.memory,
    addressing: run.addressing,
  })
}

function advanceUntil(
  state: PreviewState,
  predicate: (current: PreviewState) => boolean,
) {
  let current = state
  for (let index = 0; index < 40 && !predicate(current); index++)
    current = tick(current)
  if (!predicate(current))
    throw new Error('Replay did not reach expected state')
  return current
}

describe('historical replay projection', () => {
  it('is regenerated exactly from real historical turn two', () => {
    expect(projection).toEqual(
      projectHistoricalTurn(
        historical as unknown as HistoricalMessagingCapture,
        'live-turn-2',
      ),
    )
  })

  it('retains the complete touched before/after set and recorded evidence', () => {
    const turn = historical.turns[1]
    const planner = turn.calls.find(({ task }) => task === 'query-planner')
    const responder = turn.calls.find(({ task }) => task === 'responder')
    const memory = turn.calls.find(({ task }) => task === 'memory')
    const addressing = turn.calls.find(({ task }) => task === 'addressing')
    if (
      planner?.task !== 'query-planner' ||
      responder?.task !== 'responder' ||
      memory?.task !== 'memory' ||
      addressing?.task !== 'addressing'
    )
      throw new Error('Historical turn is missing a recorded call')
    expect(projection.input).toEqual(turn.input)
    expect(projection.posts.diffs).toEqual(turn.receipt.diffs)
    expect(projection.posts.before).toEqual(
      turn.receipt.diffs.map(({ before }) => before),
    )
    expect(projection.posts.after).toEqual(
      turn.receipt.diffs.map(({ after }) => after),
    )
    expect(projection.trace.planner.queries).toEqual(planner.output.queries)
    expect(projection.trace.planner.queries).toHaveLength(3)
    expect(projection.trace.context.posts).toEqual(
      responder.input.queryResults?.posts.map(
        ({ id, version, title, summary, detail }) => ({
          id,
          version,
          title,
          summary,
          detail,
        }),
      ),
    )
    expect(projection.trace.memory.operations).toEqual(memory.output.operations)
    expect(projection.trace.addressing.resolutions).toEqual(
      addressing.output.resolutions,
    )
    expect(projection.trace.addressing.resolutions).toEqual([])
    expect(projection.requests.before).toEqual(projection.requests.after)
    expect(projection.memory.before[0].text).toBe(
      'Prefer detailed factual posts.',
    )
    expect(projection.memory.after[0].text).toBe('Prefer concise posts.')
    expect(projection.source).toMatchObject({
      file: 'poc/messaging/result.json',
      turnId: 'live-turn-2',
      provenance: { scripted: false, model: 'gemini-3.8-flash-medium' },
    })
    expect(JSON.stringify(projection)).not.toMatch(
      /accessToken|authorization|refreshToken|sessionCookie/i,
    )
    expect(JSON.stringify(projection)).not.toMatch(/Clipwise/)
  })
})

describe('deterministic replay state', () => {
  it('reveals frames, publishes atomically, then completes both parallel jobs', () => {
    let state = scenario('replay')
    const run = () => state.agentByUser.alex.run
    expect(run()).toMatchObject({
      stage: 'planning',
      frame: 0,
      published: false,
    })
    expect(state.agentByUser.alex.messages).toHaveLength(2)
    expect(state.posts.map(({ summary }) => summary)).toEqual(
      projection.posts.before.map(({ summary }) => summary),
    )

    state = tick(state)
    expect(run()).toMatchObject({ stage: 'planning', frame: 1 })
    state = advanceUntil(
      state,
      (current) => current.agentByUser.alex.run?.stage === 'retrieving',
    )
    expect(run()).toMatchObject({ stage: 'retrieving', frame: 0 })
    state = tick(state)
    expect(run()).toMatchObject({ stage: 'retrieving', frame: 1 })
    state = advanceUntil(
      state,
      (current) => current.agentByUser.alex.run?.stage === 'generating',
    )
    expect(state.agentByUser.alex.messages).toHaveLength(2)
    state = tick(state)
    expect(run()).toMatchObject({ stage: 'generating', frame: 1 })
    state = advanceUntil(
      state,
      (current) => current.agentByUser.alex.run?.stage === 'publishing',
    )
    state = tick(state)
    expect(run()).toMatchObject({ stage: 'publishing', frame: 1 })
    expect(state.agentByUser.alex.messages).toHaveLength(2)

    state = tick(state)
    expect(run()).toMatchObject({
      stage: 'background',
      frame: 0,
      published: true,
      memory: 'running',
      addressing: 'running',
    })
    expect(state.agentByUser.alex.messages.at(-1)?.text).toBe(
      projection.assistant.text,
    )
    expect(state.posts.map(({ summary }) => summary)).toEqual(
      projection.posts.after.map(({ summary }) => summary),
    )
    expect(state.agentByUser.alex.memories[0].text).toBe(
      projection.memory.before[0].text,
    )
    expect(isAgentBusy(run())).toBe(true)

    state = tick(state)
    expect(run()).toMatchObject({ stage: 'background', frame: 1 })
    expect(state.agentByUser.alex.memories[0].text).toBe(
      projection.memory.before[0].text,
    )
    state = tick(state)
    expect(run()).toMatchObject({
      stage: 'complete',
      status: 'complete',
      memory: 'done',
      addressing: 'done',
    })
    expect(state.agentByUser.alex.memories[0].text).toBe(
      projection.memory.after[0].text,
    )
    expect(
      state.agentByUser.alex.messages.filter(isUnaddressed).map(({ id }) => id),
    ).toEqual([projection.requests.after[0].id])
    expect(isAgentBusy(run())).toBe(false)
  })

  it('pauses without advancing and restarts from the exact before state', () => {
    let state = scenario('replay')
    state = previewReducer(state, { type: 'setRunPlaying', playing: true })
    expect(state.agentByUser.alex.run?.autoPlay).toBe(true)
    state = tick(state)
    state = previewReducer(state, { type: 'setRunPlaying', playing: false })
    expect(state.agentByUser.alex.run).toMatchObject({
      stage: 'planning',
      frame: 1,
      autoPlay: false,
    })
    state = previewReducer(state, { type: 'restartRun', playing: false })
    expect(state.agentByUser.alex.run).toMatchObject({
      stage: 'planning',
      frame: 0,
      autoPlay: false,
    })
    expect(state.agentByUser.alex.memories[0].text).toBe(
      projection.memory.before[0].text,
    )
    expect(state.posts.map(({ detail }) => detail)).toEqual(
      projection.posts.before.map(({ detail }) => detail),
    )
  })

  it('keeps the completed replay trace when a later turn starts', () => {
    const before = scenario('rich-complete')
    const previousRun = before.agentByUser.alex.run
    const after = previewReducer(before, {
      type: 'sendMessage',
      id: 'later-turn',
      text: 'Thanks.',
      previewRun: true,
    })
    expect(after.agentByUser.alex.run?.messageId).toBe('later-turn')
    expect(
      after.agentByUser.alex.messages.find(
        ({ id }) => id === previousRun?.outcome?.responseId,
      )?.replyRun,
    ).toEqual(previousRun)
  })
})
