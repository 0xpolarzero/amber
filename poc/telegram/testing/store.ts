import { Effect, Schema } from 'effect'
import { conditionalResolutions, type SavedResolution } from '../../shared/addressing'
import { OwnerCoordinator } from '../../shared/owner-coordinator'
import * as S from '../schemas'
import { type Ports, tools } from '../tools'
import { memories as fixtureMemories } from './fixtures'

type PendingCandidate = NonNullable<(typeof S.ProjectContext.Type)['selectedCandidate']> & {
  groupId: string
  knownLinks?: readonly string[]
}

type StoreOptions = {
  coordinator?: OwnerCoordinator
  candidates?: readonly NonNullable<PendingCandidate>[]
  pendingRequests?: readonly (typeof S.PendingRequest.Type & { ownerId: string })[]
  sources?: Readonly<Record<string, readonly (typeof S.Source.Type)[]>>
  projectGroups?: Readonly<Record<string, string>>
  ownerNames?: Readonly<Record<string, string>>
  memories?: Readonly<Record<string, readonly (typeof S.Memory.Type)[]>>
}

const uniqueSources = (items: readonly (typeof S.Source.Type)[]) => [
  ...new Map(items.map((source) => [JSON.stringify(source), source])).values(),
]

// Real shared in-memory state and synchronization for the PoC. Restart durability is not claimed.
export function telegramStore(
  batch: typeof S.BatchContext.Type,
  initialPosts: readonly (typeof S.Post.Type)[],
  options: StoreOptions = {},
) {
  const coordinator = options.coordinator ?? new OwnerCoordinator()
  const posts = new Map(initialPosts.map((post) => [post.id, structuredClone(post)]))
  const candidates = new Map(
    (options.candidates ?? []).map((candidate) => [candidate.id, structuredClone(candidate)]),
  )
  const sources = new Map(
    Object.entries(options.sources ?? {}).map(([id, values]) => [id, [...values]]),
  )
  const sourceAssociations = new Map<string, Set<string>>()
  for (const association of batch.associations) {
    const targets = sourceAssociations.get(association.messageId) ?? new Set<string>()
    targets.add(association.targetId)
    sourceAssociations.set(association.messageId, targets)
  }
  const receipts = new Map<string, typeof S.ProjectResult.Type>()
  const pendingRequests = new Map(
    (options.pendingRequests ?? []).map((request) => [request.id, structuredClone(request)]),
  )
  const resolutions = new Map<string, SavedResolution>()
  const questions: {
    id: string
    authorId: string
    postId: string | null
    pendingCandidateId: string | null
    text: string
    needsReply: true
  }[] = []
  const notifications: {
    id: string
    authorId: string
    role: 'assistant'
    intent: 'informational'
    text: string
    sourceIds: readonly string[]
  }[] = []
  const diffs: { postId: string; before: typeof S.Post.Type; after: typeof S.Post.Type }[] = []
  const retries: string[] = []
  const progress: Parameters<Ports['progress']>[0][] = []
  const matches = (text: string, queries: readonly string[]) => {
    const words = queries.flatMap((query) =>
      query
        .toLowerCase()
        .split(/\W+/)
        .filter((word) => word.length > 2),
    )
    return words.some((word) => text.toLowerCase().includes(word))
  }
  let selection: typeof S.Selection.Type = {
    candidates: [],
    ignored: [],
    unresolved: [],
    lookedUpProjects: [],
  }
  let work: (typeof S.WorkItem.Type)[] | undefined
  const run = <A>(operation: string, f: () => A) =>
    Effect.try({
      try: f,
      catch: (error) => new S.Failure({ operation, message: String(error) }),
    })
  const targetGroup = (targetId: string) => options.projectGroups?.[targetId] ?? batch.groupId
  const links = (text: string) => [...text.matchAll(/https?:\/\/[^\s)]+/g)].map(([url]) => url)
  const publicProjects = (): (typeof S.PublicProject.Type)[] => [
    ...[...posts.values()].map((post) => ({
      targetId: post.id,
      targetKind: 'post' as const,
      ownerId: post.authorId,
      ownerName: options.ownerNames?.[post.authorId] ?? post.authorId,
      project: post.title,
      knownLinks: uniqueSources(sources.get(post.id) ?? [])
        .filter(
          (source): source is Extract<typeof S.Source.Type, { kind: 'web' }> =>
            source.kind === 'web',
        )
        .map(({ url }) => url)
        .concat(links(post.detail))
        .slice(0, 8),
      version: post.version,
    })),
    ...[...candidates.values()].map((candidate) => ({
      targetId: candidate.id,
      targetKind: 'candidate' as const,
      ownerId: candidate.authorId,
      ownerName: options.ownerNames?.[candidate.authorId] ?? candidate.authorId,
      project: candidate.title,
      knownLinks: [...(candidate.knownLinks ?? [])].slice(0, 8),
      version: candidate.version,
    })),
  ]

  const ports: Omit<Ports, 'model'> = {
    progress: (event) => run('progress', () => progress.push(event)).pipe(Effect.asVoid),
    loadBatch: (input) =>
      run('load-batch', () => {
        if (input.groupId !== batch.groupId || input.batchId !== batch.batchId)
          throw new Error('Unknown batch.')
        return batch
      }),
    queueProjects: (input) =>
      run('queue-projects', () => {
        if (!work) {
          selection = input.selection
          const lookedUp = new Map(selection.lookedUpProjects.map((item) => [item.targetId, item]))
          work = selection.candidates.map((candidate, index) => {
            let ownerId: string
            if (candidate.target.kind === 'new') ownerId = candidate.target.ownerId
            else {
              const targetId = candidate.target.targetId
              const supplied = lookedUp.get(targetId)
              const associated = batch.associations.find(
                ({ messageId, targetId: associatedTargetId }) =>
                  candidate.messageIds.includes(messageId) && associatedTargetId === targetId,
              )
              ownerId = supplied?.ownerId ?? associated?.ownerId ?? ''
              if (!ownerId)
                throw new Error('Existing target owner was not supplied by the application.')
            }
            return {
              batchId: batch.batchId,
              groupId: batch.groupId,
              candidateId: `${batch.batchId}:${index}`,
              revision: 0,
              ownerId,
              candidate,
            }
          })
        }
        return { batch: { batchId: batch.batchId, groupId: batch.groupId }, items: work }
      }),
    loadProject: (item) =>
      run('load-project', () => {
        const targetId =
          item.candidate.target.kind === 'existing' ? item.candidate.target.targetId : null
        const selectedPost = targetId ? (posts.get(targetId) ?? null) : null
        const selectedCandidate = targetId ? (candidates.get(targetId) ?? null) : null
        if (targetId && !selectedPost && !selectedCandidate)
          throw new Error('Selected target disappeared.')
        const targetSources = targetId ? (sources.get(targetId) ?? []) : []
        const sourceMessageIds = targetSources
          .filter(
            (source): source is Extract<typeof S.Source.Type, { kind: 'telegram' }> =>
              source.kind === 'telegram',
          )
          .map(({ messageId }) => messageId)
        const selected = new Set([...item.candidate.messageIds, ...sourceMessageIds])
        for (const message of batch.messages)
          if (selected.has(message.id) && message.replyToId) selected.add(message.replyToId)
        return {
          work: item,
          messages: batch.messages.filter(({ id }) => selected.has(id)).slice(0, 100),
          clarifications: [],
          selectedPost,
          selectedCandidate,
          memories: [...(options.memories?.[item.ownerId] ?? fixtureMemories[item.ownerId] ?? [])],
          pendingRequests: [...pendingRequests.values()]
            .filter(
              (request) =>
                request.ownerId === item.ownerId &&
                !request.addressed &&
                (targetId === request.linkedPostId || targetId === request.pendingCandidateId),
            )
            .sort((a, b) => a.sequence - b.sequence)
            .slice(0, 20)
            .map(({ ownerId: _ownerId, ...request }) => request),
        }
      }),
    readTool: (scope, name, input) =>
      run('read-tool', () => {
        if (scope.groupId !== batch.groupId || scope.batchId !== batch.batchId)
          throw new Error('Wrong Telegram application scope.')
        if (name === 'readMessages') {
          const { ids } = Schema.decodeUnknownSync(tools.readMessages.input)(input)
          return batch.messages.filter((message) => ids.includes(message.id))
        }
        if (name === 'searchMessages') {
          const { query } = Schema.decodeUnknownSync(tools.searchMessages.input)(input)
          return batch.messages.filter((message) => matches(message.text, [query])).slice(0, 20)
        }
        const { queries, cursor = 0 } = Schema.decodeUnknownSync(tools.searchPosts.input)(input)
        const found = publicProjects()
          .filter(({ targetId }) => targetGroup(targetId) === batch.groupId)
          .filter((project) =>
            matches(
              `${project.project} ${project.ownerName} ${project.knownLinks.join(' ')}`,
              queries,
            ),
          )
          .sort((a, b) => a.targetId.localeCompare(b.targetId))
        const items = found.slice(cursor, cursor + 20)
        return {
          items,
          nextCursor: cursor + items.length < found.length ? cursor + items.length : null,
        }
      }),
    publishProject: ({ context, draft }) =>
      Effect.tryPromise({
        try: () =>
          coordinator.runTelegramWrite(context.work.ownerId, () => {
            const { work: item } = context
            const key = `${item.candidateId}@${item.revision}`
            const saved = receipts.get(key)
            if (saved) return saved
            const proposal = draft.proposal
            const edit = proposal.postEdit
            let postId: string | null = null
            let outcome: typeof S.ProjectResult.Type.outcome = 'skipped'
            if (edit) {
              const before = edit.existingPostId ? posts.get(edit.existingPostId) : undefined
              if (edit.existingPostId) {
                if (
                  item.candidate.target.kind !== 'existing' ||
                  edit.existingPostId !== item.candidate.target.targetId ||
                  !before ||
                  before.authorId !== item.ownerId ||
                  before.version !== edit.expectedVersion
                )
                  throw new Error('Stale or unauthorized post version; re-read and regenerate.')
              }
              postId = before?.id ?? item.candidateId
              const after = {
                id: postId,
                authorId: item.ownerId,
                version: (before?.version ?? 0) + 1,
                title: edit.title,
                summary: edit.summary,
                detail: edit.detail,
              }
              posts.set(postId, after)
              sources.set(postId, uniqueSources([...(sources.get(postId) ?? []), ...edit.sources]))
              for (const source of edit.sources)
                if (source.kind === 'telegram') {
                  const targets = sourceAssociations.get(source.messageId) ?? new Set<string>()
                  targets.add(postId)
                  sourceAssociations.set(source.messageId, targets)
                }
              if (before) diffs.push({ postId, before, after })
              outcome = before ? 'updated' : 'created'
            }
            const currentRequests = new Map(
              [...pendingRequests].map(([id, request]) => [id, { addressed: request.addressed }]),
            )
            const accepted = conditionalResolutions(
              context.pendingRequests,
              currentRequests,
              resolutions,
              proposal.resolutions,
              key,
            )
            for (const resolution of accepted) {
              const request = pendingRequests.get(resolution.requestMessageId)
              if (!request || request.ownerId !== item.ownerId)
                throw new Error('Request owner changed.')
              pendingRequests.set(request.id, { ...request, addressed: true })
              resolutions.set(request.id, resolution)
            }
            if (!edit && accepted.length) outcome = 'resolved'
            let questionId: string | null = null
            if (proposal.question) {
              questionId = `${key}:question`
              const targetId =
                postId ??
                (item.candidate.target.kind === 'existing'
                  ? item.candidate.target.targetId
                  : item.candidateId)
              if (!pendingRequests.has(questionId)) {
                const pendingCandidateId = posts.has(targetId) ? null : targetId
                pendingRequests.set(questionId, {
                  id: questionId,
                  ownerId: item.ownerId,
                  sequence: pendingRequests.size + 1,
                  text: proposal.question.text,
                  intent: 'question',
                  linkedPostId: pendingCandidateId ? null : targetId,
                  pendingCandidateId,
                  addressed: false,
                })
                questions.push({
                  id: questionId,
                  authorId: item.ownerId,
                  postId: pendingCandidateId ? null : targetId,
                  pendingCandidateId,
                  text: proposal.question.text,
                  needsReply: true,
                })
              }
              if (!edit && !accepted.length) outcome = 'question'
            }
            const effectCount =
              Number(Boolean(edit)) + accepted.length + Number(Boolean(proposal.question))
            const notificationMessageId = effectCount ? `${key}:notification` : null
            if (
              notificationMessageId &&
              !notifications.some(({ id }) => id === notificationMessageId)
            ) {
              const labels = [
                edit ? '1 post edited' : null,
                accepted.length
                  ? `${accepted.length} question${accepted.length === 1 ? '' : 's'} answered`
                  : null,
                proposal.question ? '1 question asked' : null,
              ].filter(Boolean)
              notifications.push({
                id: notificationMessageId,
                authorId: item.ownerId,
                role: 'assistant',
                intent: 'informational',
                text: labels.join(' · '),
                sourceIds: uniqueSources([
                  ...(edit?.sources ?? []),
                  ...proposal.resolutions.flatMap(({ sources }) => sources),
                ]).map((source) => (source.kind === 'web' ? source.url : source.messageId)),
              })
            }
            const result = {
              candidateId: item.candidateId,
              outcome,
              postId,
              resolvedRequestIds: accepted.map(({ requestMessageId }) => requestMessageId),
              notificationMessageId,
            }
            receipts.set(key, result)
            return result
          }),
        catch: (error) => new S.Failure({ operation: 'publish-project', message: String(error) }),
      }),
    queueProjectRetry: ({ work: item, failure }) =>
      run('queue-project-retry', () => {
        retries.push(failure.message)
        if (work)
          work = work.map((current) =>
            current.candidateId === item.candidateId
              ? { ...current, revision: current.revision + 1 }
              : current,
          )
        return {
          candidateId: item.candidateId,
          outcome: 'retry',
          postId: null,
          resolvedRequestIds: [],
          notificationMessageId: null,
        }
      }),
    finishBatch: () =>
      run('finish-batch', () => ({
        completed: (work ?? []).every((item) =>
          receipts.has(`${item.candidateId}@${item.revision}`),
        ),
      })),
  }
  const result = () => ({
    posts: [...posts.values()].sort((a, b) => a.authorId.localeCompare(b.authorId)),
    questions,
    notifications,
    resolutions: Object.fromEntries(resolutions),
    diffs,
    ignored: selection.ignored,
    unresolved: selection.unresolved,
    sources: Object.fromEntries([...sources.entries()].sort(([a], [b]) => a.localeCompare(b))),
    associations: Object.fromEntries(
      [...sourceAssociations]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([id, targets]) => [id, [...targets].sort()]),
    ),
  })
  return {
    ports,
    result,
    sources,
    questions,
    notifications,
    resolutions,
    diffs,
    retries,
    progress,
    get posts() {
      return result().posts
    },
    get ignored() {
      return selection.ignored
    },
    get unresolved() {
      return selection.unresolved
    },
    get work() {
      return work
    },
  }
}
