import type * as S from './schemas'

export function validateChanges(
  userId: string,
  context: typeof S.Context.Type,
  answer: typeof S.Answer.Type,
) {
  if (context.userId !== userId) throw new Error('Context belongs to another user.')
  const ids = new Set<string>()
  for (const change of answer.changes) {
    const post = context.posts.find((post) => post.id === change.postId)
    if (
      !post ||
      post.authorId !== userId ||
      post.version !== change.expectedVersion ||
      ids.has(change.postId) ||
      !Object.keys(change.patch).length
    )
      throw new Error('Change needs a distinct, owned, retrieved post at its expected version.')
    ids.add(change.postId)
  }
}

export function validateSelection(
  batch: typeof S.BatchContext.Type,
  selection: typeof S.Selection.Type,
) {
  const messages = new Map(batch.messages.map((message) => [message.id, message]))
  const fresh = new Set(batch.newMessageIds)
  const covered = new Set<string>()
  for (const candidate of selection.candidates) {
    if (
      candidate.messageIds.some((id) => !messages.has(id)) ||
      !candidate.messageIds.some(
        (id) => fresh.has(id) && messages.get(id)?.authorId === candidate.authorId,
      )
    )
      throw new Error('Candidate needs supplied evidence and a new message from its author.')
    for (const id of candidate.messageIds) if (fresh.has(id)) covered.add(id)
  }
  const ignored = new Set<string>()
  for (const item of selection.ignored) {
    if (!fresh.has(item.messageId) || covered.has(item.messageId) || ignored.has(item.messageId))
      throw new Error('Ignore only distinct, new, unselected messages.')
    ignored.add(item.messageId)
  }
  if ([...fresh].some((id) => !covered.has(id) && !ignored.has(id)))
    throw new Error('Every new message needs an explicit disposition.')
}

export function validateDraft(context: typeof S.ProjectContext.Type, draft: typeof S.Draft.Type) {
  const { proposal, evidence } = draft
  if (proposal.kind === 'skip') return
  const messages = [...context.messages, ...evidence.messages]
  for (const source of proposal.sources) {
    if (
      source.kind === 'telegram'
        ? !messages.some((message) => message.id === source.messageId)
        : source.kind === 'clarification'
          ? !context.clarifications.some((message) => message.id === source.messageId)
          : !evidence.pages.some((page) => page.url === source.url)
    )
      throw new Error('Cite only supplied messages or actual web tool results.')
  }
  if (proposal.kind !== 'post') return
  if (
    !proposal.sources.some(
      (source) =>
        source.kind === 'telegram' &&
        messages.some(
          (message) =>
            message.id === source.messageId && message.authorId === context.work.candidate.authorId,
        ),
    )
  )
    throw new Error('A post needs cited evidence from its author.')
  if (proposal.existingPostId === null) {
    if (proposal.expectedVersion !== null) throw new Error('A new post has no existing version.')
    return
  }
  const post = [...context.posts, ...evidence.posts].find(
    (post) => post.id === proposal.existingPostId,
  )
  if (
    !post ||
    post.authorId !== context.work.candidate.authorId ||
    post.version !== proposal.expectedVersion
  )
    throw new Error('Update only a retrieved, owned post at its expected version.')
}
