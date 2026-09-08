import { describe, expect, it } from 'vitest'
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
  if (!run) throw new Error('Expected a run')
  return previewReducer(state, {
    type: 'advanceRun',
    userId: 'alex',
    messageId: run.messageId,
    stage: run.stage,
    memory: run.memory,
    addressing: run.addressing,
  })
}

describe('agent fixtures', () => {
  it('grounds the default in the accepted two-turn result with consistent post changes', () => {
    const state = scenario('rich-complete')
    const agent = state.agentByUser.alex
    expect(state.role).toBe('author')
    expect(agent.messages.filter(isUnaddressed).map(({ id }) => id)).toEqual([
      'request-exports',
    ])
    expect(
      agent.messages.find(({ id }) => id === 'information-only')?.needsReply,
    ).toBeUndefined()
    expect(
      agent.messages.find(({ id }) => id === 'request-team')?.resolution,
    ).toBe('ignored')
    expect(
      agent.messages.find(({ id }) => id === 'request-language')?.resolution,
    ).toBe('answered')
    expect(
      state.posts.find(({ project }) => project === 'Clipwise'),
    ).toMatchObject({
      detail: expect.stringContaining('MIT license'),
    })
    expect(
      state.posts.find(({ project }) => project === 'Atlas')?.summary,
    ).toContain('offline')
    expect(agent.memories).toEqual([
      expect.objectContaining({ text: 'Prefer concise posts.', version: 3 }),
    ])
    expect(agent.memoryHistory.map(({ kind }) => kind)).toEqual([
      'created',
      'replaced',
      'deleted',
      'replaced',
    ])
  })

  it('keeps every actionable incoming request pending, including one deferred once', () => {
    const state = scenario('incoming')
    const pending = state.agentByUser.alex.messages.filter(isUnaddressed)
    expect(pending).toHaveLength(4)
    expect(pending.find(({ id }) => id === 'request-exports')?.deferred).toBe(
      true,
    )
    expect(pending.some(({ id }) => id === 'information-only')).toBe(false)
  })

  it('resets scenario data, drafts, progress, errors and account state together', () => {
    let state = scenario('failure-memory')
    state = previewReducer(state, {
      type: 'draftMessage',
      text: 'Keep this only here.',
    })
    state = previewReducer(state, { type: 'role', role: 'visitor' })
    const reset = previewReducer(state, {
      type: 'loadScenario',
      id: 'failure-memory',
    })
    expect(reset.role).toBe('author')
    expect(reset.agentByUser.alex.draft).toBe('')
    expect(reset.agentByUser.alex.run?.memory).toBe('failed')
    expect(reset.agentByUser.you.messages).toEqual([])
    expect(reset.scenarioRevision).toBe(1)
  })

  it('applies every field in a multi-post response to the feed snapshot', () => {
    const state = scenario('multi-diff')
    const response = state.agentByUser.alex.messages.at(-1)
    expect(response?.changes).toHaveLength(3)
    for (const change of response?.changes ?? []) {
      const post = state.posts.find(({ id }) => id === change.postId)
      expect(post).toBeDefined()
      for (const field of change.fields)
        expect(post?.[field.field]).toBe(field.after)
    }
  })
})

describe('turn progress and admission', () => {
  it('locks sends through both background jobs while preserving a draft', () => {
    let state = scenario('stage-planning')
    state = previewReducer(state, {
      type: 'draftMessage',
      text: 'My next message.',
    })
    const duplicate = {
      type: 'sendMessage' as const,
      id: 'blocked',
      text: 'My next message.',
      previewRun: true,
    }
    for (let index = 0; index < 4; index++) {
      expect(previewReducer(state, duplicate)).toBe(state)
      state = tick(state)
      expect(state.agentByUser.alex.draft).toBe('My next message.')
    }
    const published = state.agentByUser.alex
    expect(published.run).toMatchObject({
      stage: 'background',
      memory: 'running',
      addressing: 'running',
    })
    expect(published.messages.at(-1)).toMatchObject({
      sender: 'amber',
      changes: expect.arrayContaining([
        expect.objectContaining({ project: 'Atlas' }),
      ]),
    })
    expect(
      state.posts.find(({ project }) => project === 'Atlas')?.summary,
    ).toContain('offline')
    expect(previewReducer(state, duplicate)).toBe(state)
    state = tick(state)
    expect(state.agentByUser.alex.run).toMatchObject({
      memory: 'done',
      addressing: 'running',
    })
    expect(isAgentBusy(state.agentByUser.alex.run)).toBe(true)
    expect(state.agentByUser.alex.messages.at(-1)?.memoryEvents).toHaveLength(1)
    state = tick(state)
    expect(isAgentBusy(state.agentByUser.alex.run)).toBe(false)
    expect(state.agentByUser.alex.draft).toBe('My next message.')
    const sent = previewReducer(state, duplicate)
    expect(sent.agentByUser.alex.messages.at(-1)?.id).toBe('blocked')
    expect(sent.agentByUser.alex.draft).toBe('')
  })

  it('supports either parallel job finishing first', () => {
    const memoryLast = tick(scenario('stage-background-memory'))
    expect(memoryLast.agentByUser.alex.run).toMatchObject({
      status: 'complete',
      memory: 'done',
      addressing: 'done',
    })
    expect(memoryLast.agentByUser.alex.memoryHistory.at(-1)?.kind).toBe(
      'replaced',
    )
    const addressingLast = tick(scenario('stage-background-addressing'))
    expect(addressingLast.agentByUser.alex.run).toMatchObject({
      status: 'complete',
      memory: 'done',
      addressing: 'done',
    })
  })
})

describe('background retry', () => {
  it('retries only the failed job and preserves the visible answer and applied diff', () => {
    const failed = scenario('failure-memory')
    const messages = failed.agentByUser.alex.messages
    const posts = failed.posts
    const retrying = previewReducer(failed, {
      type: 'retryBackground',
      task: 'memory',
    })
    expect(retrying.agentByUser.alex.run).toMatchObject({
      stage: 'background',
      status: 'running',
      memory: 'running',
      addressing: 'done',
      memoryAttempts: 2,
    })
    expect(retrying.agentByUser.alex.messages).toBe(messages)
    expect(retrying.posts).toBe(posts)
    const finished = tick(retrying)
    expect(finished.agentByUser.alex.run).toMatchObject({
      status: 'complete',
      memory: 'done',
    })
    expect(finished.posts).toBe(posts)
    expect(finished.agentByUser.alex.messages.at(-1)?.changes).toEqual(
      messages.at(-1)?.changes,
    )
  })

  it('bounds retries and rejects a stale retry after a newer turn', () => {
    const exhausted = scenario('retry-exhausted')
    expect(
      previewReducer(exhausted, { type: 'retryBackground', task: 'memory' }),
    ).toBe(exhausted)
    const stale = scenario('retry-stale')
    expect(
      previewReducer(stale, { type: 'retryBackground', task: 'memory' }),
    ).toBe(stale)
  })
})
