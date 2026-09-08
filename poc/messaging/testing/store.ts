import { Effect, Schema } from 'effect'
import * as S from '../schemas'
import type { Ports } from '../tools'

type Fixture = {
  posts?: readonly (typeof S.Post.Type)[]
  memories?: readonly (typeof S.Memory.Type)[]
  messages?: readonly (typeof S.Message.Type)[]
  candidates?: readonly (typeof S.Candidate.Type)[]
  completedTurns?: readonly {
    turnId: string
    userMessageId: string
    assistantMessageId: string
  }[]
}
type TurnRecord = {
  input: typeof S.TurnInput.Type
  planner: typeof S.PlannerContext.Type
  status: 'running' | 'published' | 'completed' | 'background_failed' | 'failed'
  published?: typeof S.PublishedTurn.Type
  jobs: Map<'memory' | 'addressing', typeof S.JobReceipt.Type>
  attempts: Map<'memory' | 'addressing', number>
}

const actionable = (intent: typeof S.Intent.Type) => intent !== 'informational'
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)

export function messagingStore(fixture: Fixture = {}) {
  const posts = new Map((fixture.posts ?? []).map((item) => [item.id, structuredClone(item)]))
  const memories = new Map((fixture.memories ?? []).map((item) => [item.id, structuredClone(item)]))
  const messages = new Map((fixture.messages ?? []).map((item) => [item.id, structuredClone(item)]))
  const candidates = new Map(
    (fixture.candidates ?? []).map((item) => [item.id, structuredClone(item)]),
  )
  const turns = new Map<string, TurnRecord>()
  const active = new Map<string, string>()
  const addressingReasons = new Map<string, { outcome: 'answered' | 'ignored'; reason: string }>()
  const progress: (Parameters<Ports['progress']>[0] & { at: number })[] = []
  const observations: { task: string; observation: Parameters<Ports['observe']>[1] }[] = []
  const matches = (haystack: string, terms: readonly string[]) =>
    terms.some((term) => haystack.toLocaleLowerCase().includes(term.toLocaleLowerCase()))
  let sequence = Math.max(0, ...[...messages.values()].map(({ sequence }) => sequence))

  const run = <A>(operation: string, fn: () => A) =>
    Effect.try({
      try: fn,
      catch: (error) => new S.Failure({ operation, message: String(error) }),
    })
  const userMessages = (userId: string) =>
    [...messages.values()].filter((message) => message.userId === userId)
  const unaddressed = (userId: string, cutoff = Number.POSITIVE_INFINITY) =>
    userMessages(userId)
      .filter(
        (message) =>
          message.role === 'assistant' &&
          actionable(message.intent) &&
          !message.addressed &&
          message.sequence < cutoff,
      )
      .sort((a, b) => a.sequence - b.sequence)

  for (const completed of fixture.completedTurns ?? []) {
    const userMessage = messages.get(completed.userMessageId)
    const assistantMessage = messages.get(completed.assistantMessageId)
    if (!userMessage || !assistantMessage) throw new Error('Completed turn fixture is incomplete.')
    const input = { turnId: completed.turnId, userId: userMessage.userId, text: userMessage.text }
    turns.set(completed.turnId, {
      input,
      planner: {
        turn: {
          ...input,
          userMessageId: userMessage.id,
          cutoffSequence: userMessage.sequence,
        },
        recentExchanges: [],
        pendingRequests: [],
      },
      status: 'completed',
      jobs: new Map([
        ['memory', { task: 'memory', status: 'done', reason: null }],
        ['addressing', { task: 'addressing', status: 'done', reason: null }],
      ]),
      attempts: new Map(),
    })
  }

  const completedExchanges = (userId: string, before: number) =>
    [...turns.entries()]
      .filter(([, record]) => record.status === 'completed')
      .flatMap(([turnId, record]) => {
        const userMessage = messages.get(record.planner.turn.userMessageId)
        const assistantMessage = [...messages.values()].find(
          (message) => message.turnId === turnId && message.role === 'assistant',
        )
        return userMessage &&
          assistantMessage &&
          userMessage.userId === userId &&
          userMessage.sequence < before
          ? [{ turnId, userMessage, assistantMessage }]
          : []
      })
      .sort((a, b) => b.userMessage.sequence - a.userMessage.sequence)
      .slice(0, 3)
      .reverse()

  const ports: Omit<Ports, 'model'> = {
    observe: (task, observation) =>
      run('observe', () => {
        observations.push({ task, observation })
      }),
    progress: (event) =>
      run('progress', () => {
        progress.push({ ...event, at: Date.now() })
      }),
    admitTurn: (input) =>
      run('admit-turn', () => {
        const existing = turns.get(input.turnId)
        if (existing) {
          if (!same(existing.input, input))
            throw new Error('Turn id was reused with different input.')
          return existing.planner
        }
        const current = active.get(input.userId)
        if (current) throw new Error(`User already has active turn ${current}.`)
        const userMessage: typeof S.Message.Type = {
          id: `${input.turnId}:user`,
          userId: input.userId,
          role: 'user',
          text: input.text,
          sequence: ++sequence,
          turnId: input.turnId,
          intent: 'request',
          linkedPostId: null,
          pendingCandidateId: null,
          addressed: true,
        }
        messages.set(userMessage.id, userMessage)
        const planner = {
          turn: { ...input, userMessageId: userMessage.id, cutoffSequence: userMessage.sequence },
          recentExchanges: completedExchanges(input.userId, userMessage.sequence),
          pendingRequests: unaddressed(input.userId, userMessage.sequence),
        }
        turns.set(input.turnId, {
          input,
          planner,
          status: 'running',
          jobs: new Map(),
          attempts: new Map(),
        })
        active.set(input.userId, input.turnId)
        return planner
      }),
    executeQueries: ({ context, plan }) =>
      run('execute-queries', () => {
        const record = turns.get(context.turn.turnId)
        if (
          !record ||
          record.input.userId !== context.turn.userId ||
          !same(record.planner, context)
        )
          throw new Error('Planner context is not the admitted authenticated turn.')
        const result: {
          posts: (typeof S.Post.Type)[]
          userMessages: (typeof S.Message.Type)[]
          assistantMessages: (typeof S.Message.Type)[]
        } = {
          posts: [],
          userMessages: [],
          assistantMessages: [],
        }
        for (const query of plan.queries) {
          if (query.resource === 'posts') {
            result.posts.push(
              ...[...posts.values()]
                .filter(
                  (post) =>
                    post.authorId === context.turn.userId &&
                    matches(`${post.title} ${post.summary} ${post.detail}`, query.terms),
                )
                .slice(0, query.limit),
            )
          } else {
            const role = query.resource === 'user_messages' ? 'user' : 'assistant'
            const target = role === 'user' ? result.userMessages : result.assistantMessages
            target.push(
              ...userMessages(context.turn.userId)
                .filter(
                  (message) =>
                    message.role === role &&
                    message.sequence < context.turn.cutoffSequence &&
                    matches(message.text, query.terms),
                )
                .sort((a, b) => b.sequence - a.sequence)
                .slice(0, query.limit),
            )
          }
        }
        const dedupe = <A extends { id: string }>(items: readonly A[]) => [
          ...new Map(items.map((item) => [item.id, item])).values(),
        ]
        return {
          ...context,
          queryResults: {
            posts: dedupe(result.posts).slice(0, 30),
            userMessages: dedupe(result.userMessages).slice(0, 30),
            assistantMessages: dedupe(result.assistantMessages).slice(0, 30),
          },
          memories: [...memories.values()].filter(({ userId }) => userId === context.turn.userId),
          unaddressed: unaddressed(context.turn.userId, context.turn.cutoffSequence),
          candidates: [...candidates.values()].filter(
            ({ userId, status }) => userId === context.turn.userId && status === 'pending',
          ),
        }
      }),
    publishResponse: ({ context, result }) =>
      run('publish-response', () => {
        const record = turns.get(context.turn.turnId)
        if (record?.status !== 'running' || active.get(context.turn.userId) !== context.turn.turnId)
          throw new Error('Turn is not active for publication.')
        const stagedPosts = new Map([...posts].map(([id, post]) => [id, structuredClone(post)]))
        const stagedCandidates = new Map(
          [...candidates].map(([id, candidate]) => [id, structuredClone(candidate)]),
        )
        const diffs: (typeof S.PostDiff.Type)[] = []
        for (const change of result.response.postChanges) {
          const before = stagedPosts.get(change.postId)
          if (
            !before ||
            before.authorId !== context.turn.userId ||
            before.version !== change.expectedVersion
          )
            throw new Error('Post changed or belongs to another user.')
          const after: typeof S.Post.Type = {
            id: before.id,
            authorId: before.authorId,
            version: before.version + 1,
            title: change.title,
            summary: change.summary,
            detail: change.detail,
            published: change.published,
          }
          stagedPosts.set(after.id, after)
          diffs.push({ postId: after.id, before, after })
        }
        const pending = result.response.pendingOutcome
        let linkedCandidate: string | null = null
        if (pending.kind !== 'none') {
          const candidate = stagedCandidates.get(pending.candidateId)
          if (
            !candidate ||
            candidate.userId !== context.turn.userId ||
            candidate.status !== 'pending'
          )
            throw new Error('Candidate is unavailable.')
          linkedCandidate = candidate.id
          if (pending.kind === 'publish') {
            if (candidate.version !== pending.expectedVersion || stagedPosts.has(pending.postId))
              throw new Error('Candidate changed or post id already exists.')
            const after: typeof S.Post.Type = {
              id: pending.postId,
              authorId: context.turn.userId,
              version: 1,
              title: pending.title,
              summary: pending.summary,
              detail: pending.detail,
              published: true,
            }
            stagedPosts.set(after.id, after)
            stagedCandidates.set(candidate.id, {
              ...candidate,
              status: 'published',
              version: candidate.version + 1,
            })
          }
        }
        posts.clear()
        for (const [id, post] of stagedPosts) posts.set(id, post)
        candidates.clear()
        for (const [id, candidate] of stagedCandidates) candidates.set(id, candidate)
        const userMessage = messages.get(context.turn.userMessageId)
        if (!userMessage) throw new Error('Current user message disappeared.')
        const assistantMessage: typeof S.Message.Type = {
          id: `${context.turn.turnId}:assistant`,
          userId: context.turn.userId,
          role: 'assistant',
          text: result.response.text,
          sequence: ++sequence,
          turnId: context.turn.turnId,
          intent: result.response.intent,
          linkedPostId: diffs[0]?.postId ?? null,
          pendingCandidateId: linkedCandidate,
          addressed: !actionable(result.response.intent),
        }
        messages.set(assistantMessage.id, assistantMessage)
        const published = {
          turn: context.turn,
          userMessage,
          assistantMessage,
          response: result.response,
          webEvidence: result.webEvidence,
          diffs,
          memorySnapshot: context.memories,
          requestSnapshot: context.unaddressed,
        }
        record.published = published
        record.status = 'published'
        return published
      }),
    abortTurn: ({ turn }) =>
      run('abort-turn', () => {
        const record = turns.get(turn.turnId)
        if (record && record.status === 'running') {
          record.status = 'failed'
          if (active.get(turn.userId) === turn.turnId) active.delete(turn.userId)
        }
        return {
          turnId: turn.turnId,
          userId: turn.userId,
          status: 'failed' as const,
          assistantMessageId: null,
          diffs: [],
          background: [],
        }
      }),
    loadBackgroundJob: ({ published, task }) =>
      run('load-background-job', () => {
        const record = turns.get(published.turn.turnId)
        if (!record?.published || !same(record.published, published))
          throw new Error('Unknown publication.')
        const done = record.jobs.get(task)?.status === 'done'
        if (!done) {
          const attempts = record.attempts.get(task) ?? 0
          if (attempts >= 2) throw new Error(`${task} retry budget exhausted.`)
          record.attempts.set(task, attempts + 1)
        }
        return { published, task, skip: done }
      }),
    applyMemory: ({ published, plan }) =>
      run('apply-memory', () => {
        const record = turns.get(published.turn.turnId)
        const saved = record?.jobs.get('memory')
        if (saved?.status === 'done') return saved
        const staged = new Map([...memories].map(([id, memory]) => [id, structuredClone(memory)]))
        for (const operation of plan.operations) {
          const current = staged.get(operation.id)
          if (operation.kind === 'create') {
            if (current) {
              if (current.userId !== published.turn.userId || current.text !== operation.text)
                throw new Error('Memory id already exists.')
            } else
              staged.set(operation.id, {
                id: operation.id,
                userId: published.turn.userId,
                text: operation.text,
                version: 1,
              })
          } else {
            if (
              !current ||
              current.userId !== published.turn.userId ||
              current.version !== operation.expectedVersion
            )
              throw new Error('Memory changed or belongs to another user.')
            if (operation.kind === 'delete') staged.delete(operation.id)
            else
              staged.set(operation.id, {
                ...current,
                text: operation.text,
                version: current.version + 1,
              })
          }
        }
        memories.clear()
        for (const [id, memory] of staged) memories.set(id, memory)
        const receipt = { task: 'memory' as const, status: 'done' as const, reason: null }
        record?.jobs.set('memory', receipt)
        return receipt
      }),
    applyAddressing: ({ published, plan }) =>
      run('apply-addressing', () => {
        const record = turns.get(published.turn.turnId)
        const saved = record?.jobs.get('addressing')
        if (saved?.status === 'done') return saved
        const allowed = new Map(published.requestSnapshot.map((request) => [request.id, request]))
        const ids = new Set<string>()
        for (const resolution of plan.resolutions) {
          const request = allowed.get(resolution.requestMessageId)
          if (
            !request ||
            request.userId !== published.turn.userId ||
            request.addressed ||
            ids.has(request.id)
          )
            throw new Error('Address only one unresolved request from the supplied snapshot.')
          ids.add(request.id)
        }
        for (const resolution of plan.resolutions) {
          const request = messages.get(resolution.requestMessageId)
          if (!request) throw new Error('Request disappeared.')
          messages.set(request.id, { ...request, addressed: true })
          addressingReasons.set(request.id, {
            outcome: resolution.outcome,
            reason: resolution.reason,
          })
        }
        const receipt = { task: 'addressing' as const, status: 'done' as const, reason: null }
        record?.jobs.set('addressing', receipt)
        return receipt
      }),
    recordBackgroundFailure: ({ published, task, failure }) =>
      run('record-background-failure', () => {
        const record = turns.get(published.turn.turnId)
        if (!record) throw new Error('Unknown turn.')
        const saved = record.jobs.get(task)
        if (saved?.status === 'done') return saved
        const receipt = { task, status: 'failed' as const, reason: failure.message.slice(0, 500) }
        record.jobs.set(task, receipt)
        return receipt
      }),
    finalizeTurn: ({ published, jobs }) =>
      run('finalize-turn', () => {
        const record = turns.get(published.turn.turnId)
        if (!record) throw new Error('Unknown turn.')
        const background = [jobs.memory, jobs.addressing]
        const status = background.every(({ status }) => status === 'done')
          ? ('completed' as const)
          : ('background_failed' as const)
        record.status = status
        if (active.get(published.turn.userId) === published.turn.turnId)
          active.delete(published.turn.userId)
        return {
          turnId: published.turn.turnId,
          userId: published.turn.userId,
          status,
          assistantMessageId: published.assistantMessage.id,
          diffs: published.diffs,
          background,
        }
      }),
    loadRetry: (input) =>
      run('load-retry', () => {
        const record = turns.get(input.turnId)
        if (
          !record?.published ||
          record.input.userId !== input.userId ||
          record.status !== 'background_failed'
        )
          throw new Error('No retryable background failure for this user and turn.')
        const retryable = [...record.jobs].some(
          ([task, receipt]) => receipt.status === 'failed' && (record.attempts.get(task) ?? 0) < 2,
        )
        if (!retryable) throw new Error('Background retry budget exhausted.')
        if (active.has(input.userId)) throw new Error('User already has an active turn.')
        active.set(input.userId, input.turnId)
        record.status = 'published'
        return record.published
      }),
  }

  function admitAgentMessage(input: {
    id: string
    userId: string
    text: string
    intent: typeof S.Intent.Type
    linkedPostId?: string
    pendingCandidateId?: string
  }) {
    const decoded = Schema.decodeUnknownSync(
      Schema.Struct({
        id: S.Id,
        userId: S.Id,
        text: Schema.String.check(Schema.isPattern(/\S/), Schema.isMaxLength(8_000)),
        intent: S.Intent,
        linkedPostId: Schema.optionalKey(S.Id),
        pendingCandidateId: Schema.optionalKey(S.Id),
      }),
    )(input)
    const existing = messages.get(decoded.id)
    if (existing) {
      const expected = { ...existing, sequence: existing.sequence }
      if (
        existing.role !== 'assistant' ||
        existing.userId !== decoded.userId ||
        existing.text !== decoded.text ||
        existing.intent !== decoded.intent ||
        existing.linkedPostId !== (decoded.linkedPostId ?? null) ||
        existing.pendingCandidateId !== (decoded.pendingCandidateId ?? null)
      )
        throw new Error('Outbound message id was reused with different content.')
      return expected
    }
    const post = decoded.linkedPostId ? posts.get(decoded.linkedPostId) : undefined
    const candidate = decoded.pendingCandidateId
      ? candidates.get(decoded.pendingCandidateId)
      : undefined
    if (
      (post && post.authorId !== decoded.userId) ||
      (candidate && candidate.userId !== decoded.userId)
    )
      throw new Error('Outbound link belongs to another user.')
    if (decoded.linkedPostId && !post) throw new Error('Linked post does not exist.')
    if (decoded.pendingCandidateId && !candidate)
      throw new Error('Pending candidate does not exist.')
    const message: typeof S.Message.Type = {
      id: decoded.id,
      userId: decoded.userId,
      role: 'assistant',
      text: decoded.text,
      sequence: ++sequence,
      turnId: null,
      intent: decoded.intent,
      linkedPostId: decoded.linkedPostId ?? null,
      pendingCandidateId: decoded.pendingCandidateId ?? null,
      addressed: !actionable(decoded.intent),
    }
    messages.set(message.id, message)
    return message
  }

  const snapshot = () => ({
    posts: [...posts.values()].sort((a, b) => a.id.localeCompare(b.id)),
    memories: [...memories.values()].sort((a, b) => a.id.localeCompare(b.id)),
    messages: [...messages.values()].sort((a, b) => a.sequence - b.sequence),
    candidates: [...candidates.values()].sort((a, b) => a.id.localeCompare(b.id)),
    addressing: Object.fromEntries(addressingReasons),
    turns: Object.fromEntries(
      [...turns].map(([id, record]) => [
        id,
        {
          status: record.status,
          attempts: Object.fromEntries(record.attempts),
          jobs: Object.fromEntries(record.jobs),
          published: record.published,
        },
      ]),
    ),
  })
  return { ports, admitAgentMessage, snapshot, progress, observations, active }
}
