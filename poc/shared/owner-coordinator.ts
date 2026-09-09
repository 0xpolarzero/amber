/** Shared in-process synchronization for the PoCs. This does not claim restart durability. */
export class OwnerCoordinator {
  private readonly privateTurns = new Set<string>()
  private readonly waiters = new Map<string, (() => void)[]>()
  private readonly telegramWrites = new Set<string>()

  beginPrivateTurn(ownerId: string) {
    if (this.privateTurns.has(ownerId) || this.telegramWrites.has(ownerId)) return false
    this.privateTurns.add(ownerId)
    return true
  }

  endPrivateTurn(ownerId: string) {
    this.privateTurns.delete(ownerId)
    this.release(ownerId)
  }

  async runTelegramWrite<A>(ownerId: string, write: () => A | Promise<A>): Promise<A> {
    while (this.privateTurns.has(ownerId) || this.telegramWrites.has(ownerId))
      await new Promise<void>((resolve) => {
        const queue = this.waiters.get(ownerId) ?? []
        queue.push(resolve)
        this.waiters.set(ownerId, queue)
      })
    this.telegramWrites.add(ownerId)
    try {
      return await write()
    } finally {
      this.telegramWrites.delete(ownerId)
      this.release(ownerId)
    }
  }

  private release(ownerId: string) {
    const next = this.waiters.get(ownerId)?.shift()
    if (next) next()
    if (!this.waiters.get(ownerId)?.length) this.waiters.delete(ownerId)
  }
}
