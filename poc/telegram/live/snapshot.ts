export type Snapshot = {
  version: 1
  groupId: string
  groupName: string
  importedAt: string
  accountId: string
  requestedCount: number
  authors: Record<string, { name: string; username?: string; bot?: boolean }>
  messages: {
    id: string
    authorId: string | null
    text: string
    replyToId: string | null
    albumId: string | null
    date: string
    sourceUrl: string | null
    media: boolean
    service: boolean
  }[]
}
