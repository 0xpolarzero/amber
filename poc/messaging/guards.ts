import type * as S from './schemas'

function evidenceIds(context: typeof S.ResponderContext.Type) {
  const messages = [
    ...context.recentExchanges.flatMap(({ userMessage, assistantMessage }) => [
      userMessage,
      assistantMessage,
    ]),
    ...context.pendingRequests,
    ...context.unaddressed,
    ...context.queryResults.userMessages,
    ...context.queryResults.assistantMessages,
  ]
  return {
    messages: new Set(messages.map(({ id }) => id).concat(context.turn.userMessageId)),
    requests: new Set(context.unaddressed.map(({ id }) => id)),
    memories: new Map(context.memories.map((memory) => [memory.id, memory.version])),
    posts: new Map(context.queryResults.posts.map((post) => [post.id, post])),
    candidates: new Map(context.candidates.map((candidate) => [candidate.id, candidate])),
  }
}

export function validateResponse(
  context: typeof S.ResponderContext.Type,
  result: typeof S.ResponderResult.Type,
) {
  const known = evidenceIds(context)
  const web = new Set(result.webEvidence.map(({ url }) => url))
  const validateEvidence = (items: readonly (typeof S.Evidence.Type)[]) => {
    for (const item of items) {
      const valid =
        item.kind === 'post'
          ? known.posts.get(item.id)?.version === item.version
          : item.kind === 'memory'
            ? known.memories.get(item.id) === item.version
            : item.kind === 'candidate'
              ? known.candidates.get(item.id)?.version === item.version
              : item.kind === 'web'
                ? web.has(item.url)
                : item.kind === 'request'
                  ? known.requests.has(item.id)
                  : known.messages.has(item.id)
      if (!valid) throw new Error(`Unknown or stale ${item.kind} evidence.`)
    }
  }
  for (const change of result.response.postChanges) {
    const post = known.posts.get(change.postId)
    if (!post || post.authorId !== context.turn.userId || post.version !== change.expectedVersion)
      throw new Error('Post change must target a retrieved owned post at its expected version.')
    validateEvidence(change.evidence)
  }
  const pending = result.response.pendingOutcome
  if (pending.kind !== 'none') {
    const candidate = known.candidates.get(pending.candidateId)
    if (!candidate || candidate.userId !== context.turn.userId || candidate.status !== 'pending')
      throw new Error('Pending outcome must target the authenticated user’s pending candidate.')
    if (pending.kind === 'publish') {
      if (candidate.version !== pending.expectedVersion)
        throw new Error('Candidate version changed.')
      validateEvidence(pending.evidence)
    }
  }
}
