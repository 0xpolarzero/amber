import type * as S from './schemas'

export function validateSelection(
  batch: typeof S.BatchContext.Type,
  selection: typeof S.Selection.Type,
) {
  const messages = new Map(batch.messages.map((message) => [message.id, message]))
  const fresh = new Set(batch.newMessageIds)
  const associations = new Map(batch.associations.map((item) => [item.messageId, item]))
  const lookedUp = new Map(selection.lookedUpProjects.map((item) => [item.targetId, item]))
  const covered = new Set<string>()
  const existingTargets = new Set<string>()
  for (const candidate of selection.candidates) {
    if (
      candidate.messageIds.some((id) => !messages.has(id)) ||
      !candidate.messageIds.some(
        (id) => fresh.has(id) && messages.get(id)?.authorId === candidate.authorId,
      )
    )
      throw new Error('Candidate needs supplied evidence and a fresh message from its actor.')
    if (candidate.target.kind === 'new') {
      if (candidate.target.ownerId !== candidate.authorId)
        throw new Error('New work needs firsthand maker evidence from its proposed owner.')
    } else {
      const targetId = candidate.target.targetId
      if (existingTargets.has(targetId))
        throw new Error('Route one combined candidate per existing target in a batch.')
      existingTargets.add(targetId)
      const known = lookedUp.get(targetId)
      const associated = candidate.messageIds
        .map((id) => associations.get(id))
        .find((association) => association?.targetId === targetId)
      if (!known && !associated)
        throw new Error(
          'Existing target IDs must come from supplied associations or search results.',
        )
    }
    for (const id of candidate.messageIds) if (fresh.has(id)) covered.add(id)
  }
  const disposed = new Set<string>()
  for (const [kind, items] of [
    ['ignored', selection.ignored],
    ['unresolved', selection.unresolved],
  ] as const) {
    for (const item of items) {
      if (!fresh.has(item.messageId) || covered.has(item.messageId) || disposed.has(item.messageId))
        throw new Error(`${kind} must contain distinct, fresh, unselected messages.`)
      disposed.add(item.messageId)
    }
  }
  if ([...fresh].some((id) => !covered.has(id) && !disposed.has(id)))
    throw new Error('Every new message needs an explicit disposition.')
}

export function validateDraft(context: typeof S.ProjectContext.Type, draft: typeof S.Draft.Type) {
  const { proposal, evidence } = draft
  const messages = [...context.messages, ...evidence.messages]
  const allSources = [
    ...(proposal.postEdit?.sources ?? []),
    ...(proposal.question?.sources ?? []),
    ...proposal.resolutions.flatMap(({ sources }) => sources),
  ]
  for (const source of allSources) {
    if (
      source.kind === 'telegram'
        ? !messages.some((message) => message.id === source.messageId)
        : source.kind === 'clarification'
          ? !context.clarifications.some((message) => message.id === source.messageId)
          : !evidence.pages.some((page) => page.url === source.url)
    )
      throw new Error('Cite only supplied messages or actual web tool results.')
  }
  const resolutionIds = new Set<string>()
  for (const resolution of proposal.resolutions) {
    const request = context.pendingRequests.find(({ id }) => id === resolution.requestMessageId)
    if (!request || request.addressed || resolutionIds.has(request.id))
      throw new Error('Resolve each supplied unresolved request at most once.')
    resolutionIds.add(request.id)
    if (
      resolution.outcome === 'ignored' &&
      !resolution.sources.some(
        (source) =>
          source.kind === 'clarification' ||
          (source.kind === 'telegram' &&
            messages.some(
              (message) =>
                message.id === source.messageId && message.authorId === context.work.ownerId,
            )),
      )
    )
      throw new Error('Only the owner can dismiss or explicitly ignore a pending request.')
  }
  const edit = proposal.postEdit
  if (!edit) return
  if (edit.existingPostId === null) {
    const pending = context.selectedCandidate
    if (pending) {
      if (
        context.work.candidate.target.kind !== 'existing' ||
        context.work.candidate.target.targetId !== pending.id ||
        pending.authorId !== context.work.ownerId ||
        edit.expectedVersion !== pending.version
      )
        throw new Error('Publish only the exact selected owned candidate at its expected version.')
      if (
        !pending.makerEvidence.some((id) =>
          messages.some(
            (message) => message.id === id && message.authorId === context.work.ownerId,
          ),
        )
      )
        throw new Error('Pending publication requires its saved firsthand maker evidence.')
      return
    }
    if (context.work.candidate.target.kind !== 'new' || edit.expectedVersion !== null)
      throw new Error('Only selected new work or a selected pending candidate can create a post.')
    if (
      !edit.sources.some(
        (source) =>
          source.kind === 'telegram' &&
          messages.some(
            (message) =>
              message.id === source.messageId && message.authorId === context.work.ownerId,
          ),
      )
    )
      throw new Error('New work needs cited firsthand maker evidence.')
    return
  }
  const post = context.selectedPost
  if (
    !post ||
    edit.existingPostId !== post.id ||
    post.authorId !== context.work.ownerId ||
    post.version !== edit.expectedVersion
  )
    throw new Error('Update only the exact selected owned post at its expected version.')
}
