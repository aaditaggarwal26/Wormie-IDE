export const IPC_CHANNELS = {
  openWorkspace: 'workspace:open',
  restoreWorkspace: 'workspace:restore',
  refreshWorkspace: 'workspace:refresh',
  readFile: 'workspace:read-file',
  writeFile: 'workspace:write-file',
  createEntry: 'workspace:create-entry',
  renameEntry: 'workspace:rename-entry',
  deleteEntry: 'workspace:delete-entry',
  searchWorkspace: 'workspace:search',
  gitStatus: 'git:status',
  terminalStart: 'terminal:start',
  terminalWrite: 'terminal:write',
  terminalStop: 'terminal:stop',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit',
  agentGetConfig: 'agent:get-config',
  agentSaveConfig: 'agent:save-config',
  agentSetPassingScore: 'agent:set-passing-score',
  agentGetCodexAccount: 'agent:get-codex-account',
  agentConnectCodexAccount: 'agent:connect-codex-account',
  agentStartLearning: 'agent:start-learning',
  agentSubmitQuiz: 'agent:submit-quiz',
  agentGenerateProposal: 'agent:generate-proposal',
  agentApplyProposal: 'agent:apply-proposal',
  agentCancel: 'agent:cancel'
} as const

export type FileTreeNode = {
  name: string
  path: string
  type: 'directory' | 'file'
  children?: FileTreeNode[]
}

export type WorkspaceSnapshot = {
  name: string
  rootPath: string
  entries: FileTreeNode[]
  truncated: boolean
}

export type OpenFile = {
  path: string
  name: string
  content: string
  language: string
}

export type WorkspaceMutation = {
  workspace: WorkspaceSnapshot
  path: string
  previousPath?: string
}

export type SearchResult = {
  path: string
  relativePath: string
  line: number
  column: number
  preview: string
}

export type GitFileChange = {
  path: string
  absolutePath: string
  index: string
  workingTree: string
}

export type GitRepositorySnapshot = {
  rootPath: string
  name: string
  relativePath: string
  branch: string | null
  ahead: number
  behind: number
  files: GitFileChange[]
}

export type GitStatusSnapshot = {
  workspaceRoot: string
  repositories: GitRepositorySnapshot[]
}

export type TerminalExit = {
  code: number | null
}

export type AgentProvider = 'openai-compatible' | 'codex-account'

export type AgentConfig = {
  provider: AgentProvider
  model: string
  baseUrl: string
  hasApiKey: boolean
  keyStorage: 'encrypted' | 'session' | 'none'
  passingScore: number
}

export type AgentConfigUpdate = {
  provider: AgentProvider
  model: string
  baseUrl: string
  apiKey?: string
  clearApiKey?: boolean
}

export type CodexAccountStatus = {
  available: boolean
  connected: boolean
  email: string | null
  planType: string | null
  authMode: 'chatgpt' | 'apiKey' | null
  error?: string
}

export type LearningRequest = {
  request: string
  activePath?: string | null
  openPaths?: string[]
}

export type ConceptLesson = {
  name: string
  whyItMatters: string
  mentalModel: string
  commonMistake: string
}

export type QuizQuestion = {
  id: string
  prompt: string
  options: string[]
}

export type LearningSession = {
  id: string
  request: string
  concepts: ConceptLesson[]
  lessonSummary: string
  quiz: QuizQuestion[]
  passingScore: number
}

export type QuizSubmission = {
  sessionId: string
  answers: Record<string, number>
}

export type QuizResult = {
  score: number
  passed: boolean
  feedback: Array<{
    questionId: string
    correct: boolean
    explanation: string
  }>
}

export type ProposedFileChange = {
  relativePath: string
  action: 'create' | 'update'
  content: string
  explanation: string
}

export type CodeProposal = {
  id: string
  sessionId: string
  summary: string
  changes: ProposedFileChange[]
  risks: string[]
  verification: string[]
}

export type AppliedProposal = {
  applied: boolean
  changedPaths: string[]
  workspace: WorkspaceSnapshot
}

export type DesktopApi = {
  platform: string
  openWorkspace: () => Promise<WorkspaceSnapshot | null>
  restoreWorkspace: () => Promise<WorkspaceSnapshot | null>
  refreshWorkspace: () => Promise<WorkspaceSnapshot>
  readFile: (filePath: string) => Promise<OpenFile>
  writeFile: (filePath: string, content: string) => Promise<void>
  createEntry: (parentPath: string, name: string, type: 'file' | 'directory') => Promise<WorkspaceMutation>
  renameEntry: (entryPath: string, name: string) => Promise<WorkspaceMutation>
  deleteEntry: (entryPath: string) => Promise<WorkspaceMutation | null>
  searchWorkspace: (query: string) => Promise<SearchResult[]>
  getGitStatus: () => Promise<GitStatusSnapshot>
  startTerminal: () => Promise<void>
  writeTerminal: (data: string) => void
  stopTerminal: () => void
  onTerminalData: (callback: (data: string) => void) => () => void
  onTerminalExit: (callback: (event: TerminalExit) => void) => () => void
  getAgentConfig: () => Promise<AgentConfig>
  saveAgentConfig: (config: AgentConfigUpdate) => Promise<AgentConfig>
  setAgentPassingScore: (score: number) => Promise<number>
  getCodexAccount: () => Promise<CodexAccountStatus>
  connectCodexAccount: () => Promise<CodexAccountStatus>
  startLearning: (request: LearningRequest) => Promise<LearningSession>
  submitQuiz: (submission: QuizSubmission) => Promise<QuizResult>
  generateProposal: (sessionId: string) => Promise<CodeProposal>
  applyProposal: (proposalId: string) => Promise<AppliedProposal>
  cancelAgent: () => void
}
