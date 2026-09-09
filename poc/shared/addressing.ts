export type Resolution = {
  requestMessageId: string
  outcome: 'answered' | 'ignored'
  reason: string
}

export type SavedResolution = Resolution & { sourceId: string }

type Addressable = { id: string; ownerId: string; addressed: boolean }

/** Shared in-process authority for Telegram and private-chat request resolution. */
export class AddressingState {
  private readonly requests = new Map<string, Addressable>()
  private readonly winners = new Map<string, SavedResolution>()

  register(request: Addressable) {
    const existing = this.requests.get(request.id)
    if (existing && existing.ownerId !== request.ownerId)
      throw new Error('Request id belongs to another owner.')
    if (!existing) this.requests.set(request.id, { ...request })
  }

  isAddressed(id: string, fallback = false) {
    return this.requests.get(id)?.addressed ?? fallback
  }

  apply(
    ownerId: string,
    snapshot: readonly { id: string; addressed: boolean }[],
    proposals: readonly Resolution[],
    sourceId: string,
  ) {
    const current = new Map(
      snapshot.map(({ id, addressed }) => [
        id,
        { addressed: this.requests.get(id)?.addressed ?? addressed },
      ]),
    )
    const accepted = conditionalResolutions(snapshot, current, this.winners, proposals, sourceId)
    for (const resolution of accepted) {
      const request = this.requests.get(resolution.requestMessageId)
      if (!request || request.ownerId !== ownerId) throw new Error('Request owner changed.')
      this.requests.set(request.id, { ...request, addressed: true })
      this.winners.set(request.id, resolution)
    }
    return accepted
  }

  resolutionEntries() {
    return [...this.winners.entries()] as const
  }

  get(id: string) {
    return this.winners.get(id)
  }
}

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
