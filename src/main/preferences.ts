import type { AgentProvider } from '../shared/contracts'

export type AppPreferences = {
  recentWorkspace?: string
  studentWorkspaces?: string[]
  windowBounds?: { width: number; height: number }
  learningPassingScore?: number
  agent?: {
    provider: AgentProvider
    model: string
    baseUrl: string
    encryptedApiKey?: string
  }
}
