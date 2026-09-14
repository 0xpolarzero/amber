import type { AgentConversation } from '../preview/state'

export type RealDemo = {
  importedAt: string
  messageCount: number
  processedCount: number
  model: string
  conversations: Record<string, AgentConversation>
}
