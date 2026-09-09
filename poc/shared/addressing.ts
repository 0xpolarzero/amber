export type Resolution = {
  requestMessageId: string
  outcome: 'answered' | 'ignored'
  reason: string
}

export type SavedResolution = Resolution & { sourceId: string }

/**
 * Validate resolutions against the immutable request snapshot and return only first winners.
 * The caller commits request flags and returned records in the same transaction.
 */
export function conditionalResolutions(
  snapshot: readonly { id: string; addressed: boolean }[],
  current: ReadonlyMap<string, { addressed: boolean }>,
  saved: ReadonlyMap<string, SavedResolution>,
  proposals: readonly Resolution[],
  sourceId: string,
) {
  const allowed = new Map(snapshot.map((request) => [request.id, request]))
  const proposed = new Set<string>()
  const accepted: SavedResolution[] = []
  for (const proposal of proposals) {
    const original = allowed.get(proposal.requestMessageId)
    if (!original || original.addressed || proposed.has(proposal.requestMessageId))
      throw new Error('Resolve each unresolved request from the supplied snapshot at most once.')
    proposed.add(proposal.requestMessageId)
    if (saved.has(proposal.requestMessageId) || current.get(proposal.requestMessageId)?.addressed)
      continue
    accepted.push({ ...proposal, sourceId })
  }
  return accepted
}
