import { Effect, Schema } from 'effect'
import * as S from '../schemas'
import { type Ports, tools } from '../tools'
import { memories, notedPage } from './fixtures'

// In-memory application boundary for the example. No Telegram, network or real database writes.
export function telegramStore(
  batch: typeof S.BatchContext.Type,
  initialPosts: readonly (typeof S.Post.Type)[],
) {
  const posts = new Map(initialPosts.map((post) => [post.id, structuredClone(post)]))
  const sources = new Map<string, readonly (typeof S.Source.Type)[]>()
  const receipts = new Map<string, typeof S.ProjectResult.Type>()
  const questions: { authorId: string; postId: string | null; text: string; needsReply: true }[] =
    []
  const diffs: { postId: string; before: typeof S.Post.Type; after: typeof S.Post.Type }[] = []
  const retries: string[] = []
  const progress: Parameters<Ports['progress']>[0][] = []
  const matches = (text: string, query: string) =>
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((word) => word.length > 2)
      .some((word) => text.toLowerCase().includes(word))
  let selection: typeof S.Selection.Type = { candidates: [], ignored: [] }
  let work: (typeof S.WorkItem.Type)[] | undefined
  const run = <A>(f: () => A) =>
    Effect.try({
      try: f,
      catch: (error) => new S.Failure({ operation: 'example-store', message: String(error) }),
    })
  const ports: Omit<Ports, 'model'> = {
    progress: (event) =>
      run(() => {
        progress.push(event)
      }),
    loadBatch: (input) =>
      run(() => {
        if (input.groupId !== batch.groupId || input.batchId !== batch.batchId)
          throw new Error('Unknown batch')
        return batch
      }),
    queueProjects: (input) =>
      run(() => {
        if (!work) {
          selection = input.selection
          work = selection.candidates.map((candidate, index) => ({
            batchId: batch.batchId,
            groupId: batch.groupId,
            candidateId: `${batch.batchId}:${index}`,
            revision: 0,
            candidate,
          }))
        }
        return { batch: { batchId: batch.batchId, groupId: batch.groupId }, items: work }
      }),
    loadProject: (work) =>
      run(() => ({
        work,
        messages: batch.messages.filter((m) => work.candidate.messageIds.includes(m.id)),
        posts: [...posts.values()].filter((p) => p.authorId === work.candidate.authorId),
        memories: memories[work.candidate.authorId] ?? [],
        clarifications: [],
        unaddressed: [],
      })),
    readTool: (scope, name, input) =>
      run(() => {
        if (scope.groupId !== batch.groupId || scope.batchId !== batch.batchId)
          throw new Error('Wrong scope')
        if (name === 'readPage') {
          const { url } = Schema.decodeUnknownSync(tools.readPage.input)(input)
          if (url !== notedPage.url) throw new Error('Unknown fixture page')
          return notedPage
        }
        if (name === 'readMessages') {
          const { ids } = Schema.decodeUnknownSync(tools.readMessages.input)(input)
          return batch.messages.filter((message) => ids.includes(message.id))
        }
        if (name === 'searchPosts') {
          const { query } = Schema.decodeUnknownSync(tools.searchPosts.input)(input)
          return [...posts.values()]
            .filter(
              (post) =>
                post.authorId === scope.userId && matches(`${post.title} ${post.summary}`, query),
            )
            .slice(0, 10)
        }
        if (name === 'searchMessages') {
          const { query } = Schema.decodeUnknownSync(tools.searchMessages.input)(input)
          return batch.messages.filter((message) => matches(message.text, query)).slice(0, 20)
        }
        if (name === 'searchWeb') {
          const { query } = Schema.decodeUnknownSync(tools.searchWeb.input)(input)
          return matches(notedPage.title, query) ? [notedPage] : []
        }
        throw new Error(`No fixture for tool: ${name}`)
      }),
    publishProject: ({ context, draft }) =>
      run(() => {
        const { work } = context
        const key = `${work.candidateId}@${work.revision}`
        const saved = receipts.get(key)
        if (saved) return saved
        const proposal = draft.proposal
        let postId: string | null = null
        let outcome: typeof S.ProjectResult.Type.outcome = 'skipped'
        if (proposal.kind === 'post') {
          const before = proposal.existingPostId ? posts.get(proposal.existingPostId) : undefined
          if (
            proposal.existingPostId &&
            (!before ||
              before.authorId !== work.candidate.authorId ||
              before.version !== proposal.expectedVersion)
          )
            throw new Error('Post changed or belongs to another author')
          postId = before?.id ?? work.candidateId
          const after = {
            id: postId,
            authorId: work.candidate.authorId,
            version: (before?.version ?? 0) + 1,
            title: proposal.title,
            summary: proposal.summary,
            detail: proposal.detail,
          }
          posts.set(postId, after)
          sources.set(postId, proposal.sources)
          if (before) diffs.push({ postId, before, after })
          outcome = before ? 'updated' : 'created'
        }
        const question =
          proposal.kind === 'question'
            ? proposal.text
            : proposal.kind === 'post'
              ? proposal.question
              : null
        if (question)
          questions.push({
            authorId: work.candidate.authorId,
            postId,
            text: question,
            needsReply: true,
          })
        if (proposal.kind === 'question') outcome = 'question'
        const result = { candidateId: work.candidateId, outcome, postId }
        receipts.set(key, result)
        return result
      }),
    queueProjectRetry: ({ work, failure }) =>
      run(() => {
        retries.push(failure.message)
        return { candidateId: work.candidateId, outcome: 'retry', postId: null }
      }),
    finishBatch: () =>
      run(() => ({
        completed: (work ?? []).every((item) =>
          receipts.has(`${item.candidateId}@${item.revision}`),
        ),
      })),
  }
  const result = () => ({
    posts: [...posts.values()].sort((a, b) => a.authorId.localeCompare(b.authorId)),
    questions,
    diffs,
    ignored: selection.ignored,
    sources: Object.fromEntries([...sources.entries()].sort(([a], [b]) => a.localeCompare(b))),
  })
  return {
    ports,
    result,
    sources,
    questions,
    diffs,
    retries,
    progress,
    get posts() {
      return result().posts
    },
    get ignored() {
      return selection.ignored
    },
  }
}
