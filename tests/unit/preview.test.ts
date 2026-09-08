import { describe, expect, it } from 'vitest'
import artifact from '../../poc/preview-result.json'
import { AGENT_GUIDE } from '../../src/preview/agent-example'
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

describe('recorded preview projection', () => {
  it('is the deterministic compact projection stored in the full live artifact', () => {
    expect(projection).toEqual(artifact.projection)
  })

  it('contains the exact grounded extraction and messaging evidence', () => {
    expect(projection.mode).toBe('recorded-real-model')
    expect(projection.model).toBe('gemini-3.8-flash-medium')
    expect(projection.telegram.questions).toHaveLength(1)
    expect(projection.telegram.questions[0].text).toMatch(/Mandarin/i)
    expect(
      projection.telegram.ignored.map(({ messageId }) => messageId),
    ).toContain('101')
    expect(projection.telegram.posts.map(({ authorId }) => authorId)).toEqual([
      'alex',
      'bea',
    ])
    expect(projection.telegram.diffs).toHaveLength(1)
    expect(projection.messaging.diffs).toHaveLength(1)
    expect(projection.messaging.diffs[0].before.authorId).toBe('alex')
    expect(projection.messaging.diffs[0].after.detail).toMatch(/Mandarin/i)
    expect(projection.messaging.addressing).toEqual([
      expect.objectContaining({
        requestMessageId: projection.telegram.questions[0].id,
        outcome: 'answered',
      }),
    ])
    expect(JSON.stringify(projection)).not.toMatch(/Atlas|Clipwise|Aurora/)
  })
})

describe('guided preview', () => {
  it('loads six focused checkpoints and recovers only the simulated request task', () => {
    let state = createPreviewState(fixtures)
    expect(state.role).toBe('visitor')
    expect(AGENT_GUIDE).toHaveLength(6)
    for (let step = 0; step < AGENT_GUIDE.length; step++) {
      state = previewReducer(state, { type: 'loadGuideStep', step })
      expect(state.role).toBe('author')
      expect(state.guideStep).toBe(step)
    }
    expect(state.agentByUser.alex.run).toMatchObject({
      status: 'complete',
      memory: 'done',
      addressing: 'done',
      addressingAttempts: 2,
    })
    expect(
      state.agentByUser.alex.messages.filter(
        ({ id }) => id === projection.messaging.assistant.id,
      ),
    ).toHaveLength(1)
  })

  it('shows the fake source batch and its recorded ownership boundary', () => {
    const state = scenario('extracted')
    const message = state.agentByUser.alex.messages[0]
    expect(message.text).toBe(projection.telegram.questions[0].text)
    expect(
      message.source?.messages.find(({ id }) => id === '105'),
    ).toMatchObject({
      authorId: 'carl',
      replyToId: '102',
    })
    expect(message.source?.outcomes.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          authorId: 'alex',
          outcome: 'created',
          questionCount: 1,
        }),
        expect.objectContaining({
          authorId: 'bea',
          outcome: 'updated',
          questionCount: 0,
        }),
      ]),
    )
    expect(message.source?.outcomes.ignored).toEqual(
      expect.arrayContaining([expect.objectContaining({ messageId: '101' })]),
    )
    expect(state.posts.find(({ id }) => id === message.postId)?.detail).toBe(
      projection.telegram.posts.find(({ id }) => id === message.postId)?.detail,
    )
  })

  it('replays the exact answer, post diff, addressed question and memory', () => {
    const state = scenario('rich-complete')
    const agent = state.agentByUser.alex
    expect(agent.messages.at(-1)?.text).toBe(
      projection.messaging.assistant.text,
    )
    expect(agent.messages.filter(isUnaddressed)).toEqual([])
    expect(agent.messages[0]).toMatchObject({ resolution: 'answered' })
    expect(agent.memories).toEqual(
      projection.messaging.finalMemories.map(({ id, text, version }) => ({
        id,
        text,
        version,
      })),
    )
    const post = state.posts.find(
      ({ id }) => id === projection.messaging.diffs[0].postId,
    )
    for (const field of ['title', 'summary', 'detail'] as const)
      expect(post?.[field]).toBe(projection.messaging.diffs[0].after[field])
  })

  it('publishes the recorded response before both replayed background tasks finish', () => {
    let state = scenario('stage-planning')
    const responseText = projection.messaging.assistant.text
    for (let index = 0; index < 4; index++) state = tick(state)
    expect(state.agentByUser.alex.run).toMatchObject({
      stage: 'background',
      memory: 'running',
      addressing: 'running',
    })
    expect(state.agentByUser.alex.messages.at(-1)?.text).toBe(responseText)
    expect(isAgentBusy(state.agentByUser.alex.run)).toBe(true)
    state = tick(state)
    expect(state.agentByUser.alex.run?.memory).toBe('done')
    state = tick(state)
    expect(isAgentBusy(state.agentByUser.alex.run)).toBe(false)
    expect(state.agentByUser.alex.messages[0].resolution).toBe('answered')
  })

  it('retries only simulated addressing while preserving exact recorded output', () => {
    const failed = scenario('failure-addressing')
    const messages = failed.agentByUser.alex.messages
    const posts = failed.posts
    const retrying = previewReducer(failed, {
      type: 'retryBackground',
      task: 'addressing',
    })
    expect(retrying.agentByUser.alex.run).toMatchObject({
      stage: 'background',
      status: 'running',
      memory: 'done',
      addressing: 'running',
      addressingAttempts: 2,
    })
    expect(retrying.agentByUser.alex.messages).toBe(messages)
    expect(retrying.posts).toBe(posts)
    const finished = tick(retrying)
    expect(finished.agentByUser.alex.messages.at(-1)?.text).toBe(
      projection.messaging.assistant.text,
    )
    expect(finished.agentByUser.alex.messages[0].resolution).toBe('answered')
    expect(finished.posts).toBe(posts)
  })

  it('resets guide state, account and drafts together', () => {
    let state = scenario('failure-addressing')
    state = previewReducer(state, {
      type: 'draftMessage',
      text: 'Local draft.',
    })
    state = previewReducer(state, { type: 'role', role: 'visitor' })
    const reset = previewReducer(state, {
      type: 'loadScenario',
      id: 'failure-addressing',
    })
    expect(reset.role).toBe('author')
    expect(reset.agentByUser.alex.draft).toBe('')
    expect(reset.agentByUser.alex.run?.addressing).toBe('failed')
    expect(reset.agentByUser.you.messages).toEqual([])
  })
})
