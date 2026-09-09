import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import lifecycle from '../../src/preview/generated/amber-question-preview'
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

describe('recorded lifecycle projection', () => {
  it('points to one complete real-model run', () => {
    const capture = JSON.parse(
      readFileSync(projection.source.file, 'utf8'),
    ) as {
      provenance: { runId: string; scripted: boolean; model: string }
      stages: {
        telegramCreate: { input: unknown }
        telegramEvidence: { input: unknown }
        privateReply: { input: unknown; receipt: { diffs: unknown } }
      }
    }
    expect(projection.source.runId).toBe(capture.provenance.runId)
    expect(capture.provenance).toMatchObject({
      scripted: false,
      model: 'gemini-3.8-flash-medium',
    })
    expect(capture.stages.telegramCreate.input).toBeDefined()
    expect(capture.stages.telegramEvidence.input).toBeDefined()
    expect(projection.input).toEqual(capture.stages.privateReply.input)
    expect(projection.posts.diffs).toEqual(
      capture.stages.privateReply.receipt.diffs,
    )
  })

  it('retains the coherent question, Telegram resolution, and private reply', () => {
    expect(lifecycle.question).toMatchObject({
      id: 'north-1:0@0:question',
      postId: 'north-1:0',
      needsReply: true,
    })
    expect(lifecycle.trace.telegramUpdate).toMatchObject({
      groupId: 'makers-north',
      project: 'Orbit',
      target: { kind: 'existing', targetId: 'north-1:0' },
      resolution: { outcome: 'answered', sourceIds: ['n2-23'] },
      notification: { id: 'north-2:0@0:notification' },
    })
    expect(lifecycle.messaging.notification.id).toBe(
      lifecycle.trace.telegramUpdate.notification.id,
    )
    const replay = scenario('replay').agentByUser.alex.messages
    const notification = replay.find(
      ({ id }) => id === lifecycle.messaging.notification.id,
    )
    expect(notification).toMatchObject({
      text: '1 post edited · 1 question answered',
      telegramUpdateTrace: lifecycle.trace.telegramUpdate,
    })
    expect(notification?.text).not.toContain('Sources:')
    expect(lifecycle.messaging.diffs).toEqual(projection.posts.diffs)
    expect(projection.trace.planner.queries).toHaveLength(1)
    expect(projection.trace.addressing.resolutions).toEqual([])
    expect(projection.requests.before[0].id).toBe(lifecycle.question.id)
    expect(projection.requests.after).toEqual([])
    expect(projection.memory.before.map(({ text }) => text)).toContain(
      'Prefer detailed explanations.',
    )
    expect(projection.memory.after.map(({ text }) => text)).toContain(
      'Keep posts concise and factual.',
    )
    expect(JSON.stringify(projection)).not.toMatch(
      /accessToken|authorization|refreshToken|sessionCookie/i,
    )
    expect(JSON.stringify(lifecycle)).not.toMatch(
      /accessToken|authorization|refreshToken|sessionCookie/i,
    )
  })
})

describe('deterministic replay state', () => {
  it('leaves the completed recorded reply unread until Agent is opened', () => {
    const state = createPreviewState(fixtures)
    const agent = state.agentByUser.alex
    expect(agent.messages.slice(agent.readThrough)).toMatchObject([
      { id: lifecycle.messaging.assistant.id, sender: 'amber' },
    ])
  })

  it('reveals frames, publishes atomically, then completes both parallel jobs', () => {
    let state = scenario('replay')
    const run = () => state.agentByUser.alex.run
    expect(run()).toMatchObject({
      stage: 'planning',
      frame: 0,
      published: false,
    })
    expect(state.agentByUser.alex.messages).toHaveLength(3)
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
    expect(state.agentByUser.alex.messages).toHaveLength(3)
    state = tick(state)
    expect(run()).toMatchObject({ stage: 'generating', frame: 1 })
    state = advanceUntil(
      state,
      (current) => current.agentByUser.alex.run?.stage === 'publishing',
    )
    state = tick(state)
    expect(run()).toMatchObject({ stage: 'publishing', frame: 1 })
    expect(state.agentByUser.alex.messages).toHaveLength(3)

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
    ).toEqual([])
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

  it('does not complete or apply a failed memory job when retrying requests', () => {
    let state = scenario('failure-addressing')
    const agent = state.agentByUser.alex
    if (!agent.run) throw new Error('Expected a recorded run')
    state = {
      ...state,
      agentByUser: {
        ...state.agentByUser,
        alex: { ...agent, run: { ...agent.run, memory: 'failed' } },
      },
    }
    const memories = state.agentByUser.alex.memories
    state = previewReducer(state, {
      type: 'retryBackground',
      task: 'addressing',
    })
    state = tick(tick(state))
    expect(state.agentByUser.alex.run).toMatchObject({
      memory: 'failed',
      addressing: 'done',
      status: 'failed',
    })
    expect(state.agentByUser.alex.memories).toBe(memories)
  })
})
