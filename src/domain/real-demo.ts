import type { AgentConversation } from '../preview/state'

export type RealDemo = {
  importedAt: string
  messageCount: number
  processedCount: number
  skippedCount: number
  model: string
  conversations: Record<string, AgentConversation>
}
