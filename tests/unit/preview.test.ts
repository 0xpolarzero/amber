import { describe, expect, it } from 'vitest'
import {
  type PreviewProjectionCapture,
  projectPreviewTrace,
  projectReplyTrace,
} from '../../poc/preview-projection'
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
    expect(projection).toEqual({
      ...artifact.projection,
      version: 3,
      messaging: {
        ...artifact.projection.messaging,
        trace: projectReplyTrace(
          artifact as unknown as PreviewProjectionCapture,
        ),
      },
      trace: projectPreviewTrace(
        artifact as unknown as PreviewProjectionCapture,
      ),
    })
  })

  it('derives the primary and related branches by identity after reordering', () => {
    const reordered = structuredClone(artifact)
    reordered.extraction.calls.reverse()
    reordered.extraction.result.posts.reverse()
    const selection = reordered.extraction.calls.find(
      ({ task }) => task === 'selection',
    )
    selection?.output.candidates?.reverse()

    const trace = projectPreviewTrace(
      reordered as unknown as PreviewProjectionCapture,
    )
    expect(trace).toMatchObject({
      authorId: 'alex',
      project: 'Noted',
      publication: { post: { id: 'batch-1:0' } },
      related: [{ authorId: 'bea', project: 'Tab tidy' }],
    })
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
    const planner = artifact.messaging.calls.find(
      ({ task }) => task === 'query-planner',
    )
    const responder = artifact.messaging.calls.find(
      ({ task }) => task === 'responder',
    )
    const memory = artifact.messaging.calls.find(
      ({ task }) => task === 'memory',
    )
    const addressing = artifact.messaging.calls.find(
      ({ task }) => task === 'addressing',
    )
    if (
      !planner?.output.queries ||
      !responder?.input.queryResults ||
      !responder.input.memories ||
      !responder.input.unaddressed ||
      !memory?.input.memories ||
      !addressing?.input.unaddressedSnapshot
    )
      throw new Error('Missing recorded messaging trace call')
    expect(projection.messaging.trace.planner.queries).toEqual(
      planner.output.queries,
    )
    expect(projection.messaging.trace.planner.queries).toEqual([])
    const projectMessage = ({
      id,
      text,
      linkedPostId,
    }: {
      id: string
      text: string
      linkedPostId: string | null
    }) => ({ id, text, linkedPostId })
    expect(projection.messaging.trace.context).toMatchObject({
      posts: responder.input.queryResults.posts.map(
        ({ id, version, title, summary, detail }) => ({
          id,
          version,
          title,
          summary,
          detail,
        }),
      ),
      userMessages:
        responder.input.queryResults.userMessages.map(projectMessage),
      assistantMessages:
        responder.input.queryResults.assistantMessages.map(projectMessage),
      linkedRequestPostIds: responder.input.queryResults.linkedRequestPostIds,
      memories: responder.input.memories.map(({ id, text, version }) => ({
        id,
        text,
        version,
      })),
      unaddressed: responder.input.unaddressed.map(projectMessage),
    })
    expect(projection.messaging.trace.response).toEqual(responder.output)
    expect(projection.messaging.trace.memory).toEqual({
      existing: memory.input.memories.map(({ id, text, version }) => ({
        id,
        text,
        version,
      })),
      operations: [],
    })
    expect(projection.messaging.trace.addressing).toEqual({
      requests: addressing.input.unaddressedSnapshot.map(projectMessage),
      resolutions: addressing.output.resolutions,
    })
    expect(projection.messaging.trace.addressing.resolutions[0]).toEqual({
      requestMessageId: 'preview-extracted-question-1',
      outcome: 'answered',
      reason: 'The user directly confirmed that Noted supports Mandarin.',
    })
    const selection = artifact.extraction.calls.find(
      ({ task }) => task === 'selection',
    )
    const notedWriter = artifact.extraction.calls.find(
      (call) =>
        call.task === 'post' &&
        call.input.work?.candidate.authorId === projection.trace.authorId,
    )
    if (!selection?.output.candidates)
      throw new Error('Missing recorded selection call')
    if (!notedWriter?.input.work)
      throw new Error('Missing recorded Noted writer call')
    const candidate = selection.output.candidates.find(
      ({ authorId }) => authorId === projection.trace.authorId,
    )
    expect(projection.trace.selectedMessageIds).toEqual(candidate?.messageIds)
    expect(projection.trace.context.existingPosts).toEqual(
      notedWriter.input.posts,
    )
    expect(projection.trace.context.memories).toEqual(
      notedWriter.input.memories,
    )
    expect(projection.trace.context.outstandingRequests).toEqual(
      notedWriter.input.unaddressed,
    )
    expect(projection.trace.publication.output).toEqual({
      existingPostId: notedWriter.output.existingPostId,
      sources: notedWriter.output.sources,
    })
    const publishedPost = artifact.extraction.result.posts.find(
      ({ id, authorId }) =>
        id === projection.telegram.questions[0].postId &&
        authorId === projection.trace.authorId,
    )
    if (!publishedPost) throw new Error('Missing recorded published post')
    expect(projection.trace.publication.post).toEqual({
      id: publishedPost.id,
      title: publishedPost.title,
      summary: publishedPost.summary,
      detail: publishedPost.detail,
    })
    expect(projection.trace.question).toBe(
      projection.telegram.questions[0].text,
    )
    const beaWriter = artifact.extraction.calls.find(
      (call) =>
        call.task === 'post' && call.input.work?.candidate.authorId === 'bea',
    )
    if (!beaWriter?.input.work)
      throw new Error('Missing recorded Bea writer call')
    expect(projection.trace.related[0]).toMatchObject({
      authorId: 'bea',
      messageIds: beaWriter.input.work.candidate.messageIds,
      existingPosts: beaWriter.input.posts.map(({ id, title, summary }) => ({
        id,
        title,
        summary,
      })),
    })
    expect(projection.trace.context.observedTools).toEqual([
      'amber/searchMessages',
      'amber/searchPosts',
      'amber/readMessages',
    ])
    expect(JSON.stringify(projection)).not.toMatch(
      /accessToken|authorization|runtimeInventory|refreshToken|sessionCookie/i,
    )
    expect(JSON.stringify(projection)).not.toMatch(/Atlas|Clipwise|Aurora/)
  })

  it('projects nonempty query plans and results from test-only records', () => {
    const testOnly = JSON.parse(JSON.stringify(artifact))
    const planner = testOnly.messaging.calls.find(
      ({ task }: { task: string }) => task === 'query-planner',
    )
    const responder = testOnly.messaging.calls.find(
      ({ task }: { task: string }) => task === 'responder',
    )
    if (!planner || !responder)
      throw new Error('Missing messaging calls for test-only projection')
    planner.output.queries = [
      { resource: 'posts', terms: ['TEST ONLY', 'Noted'], limit: 2 },
    ]
    responder.input.queryResults.posts.push({
      ...responder.input.queryResults.posts[0],
      id: 'test-only-query-result',
      title: 'TEST ONLY query result',
    })

    const trace = projectReplyTrace(
      testOnly as unknown as PreviewProjectionCapture,
    )
    expect(trace.planner.queries).toEqual([
      { resource: 'posts', terms: ['TEST ONLY', 'Noted'], limit: 2 },
    ])
    expect(trace.context.posts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'test-only-query-result',
          title: 'TEST ONLY query result',
        }),
      ]),
    )
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

  it('attaches the full recorded extraction trace to the question', () => {
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
    expect(message.trace).toEqual(projection.trace)
    expect(message.trace?.questionId).toBe(message.id)
    expect(message.trace?.publication.post.id).toBe(message.postId)
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

it('keeps the previous reply trace when a new turn starts', () => {
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
