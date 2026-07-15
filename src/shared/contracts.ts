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
  agentActivity: 'agent:activity',
  agentPrepareProposalQuiz: 'agent:prepare-proposal-quiz',
  agentRejectProposal: 'agent:reject-proposal',
  understandingGetSettings: 'understanding:get-settings',
  understandingSaveSettings: 'understanding:save-settings',
  understandingGetHistory: 'understanding:get-history',
  understandingGetGate: 'understanding:get-gate',
  understandingSaveAnswers: 'understanding:save-answers',
  understandingSubmit: 'understanding:submit',
  understandingBypass: 'understanding:bypass',
  gitAnalyzeStaged: 'git:analyze-staged',
  gitCommitStaged: 'git:commit-staged',
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
  runId: string
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
  runId: string
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

export type ChangeSource = 'ai_proposal' | 'git_commit'
export type ChangeSignificanceLevel = 'trivial' | 'minor' | 'major' | 'critical'
export type QuizDepth = 'none' | 'standard' | 'deep'
export type ChangeFileStatus = 'added' | 'modified' | 'deleted' | 'renamed'

export type ChangeFileInput = {
  path: string
  status: ChangeFileStatus
  additions: number
  deletions: number
  patch?: string
  beforeContent?: string
  afterContent?: string
  binary?: boolean
}

export type ChangeInput = {
  id: string
  source: ChangeSource
  title: string
  description?: string
  files: ChangeFileInput[]
  generatedCodeConfidence?: number
}

export type ChangeSignificanceResult = {
  level: ChangeSignificanceLevel
  score: number
  triggerReasons: string[]
  changedFiles: string[]
  detectedConcepts: string[]
  riskFactors: string[]
  recommendedQuizDepth: QuizDepth
  quizRequired: boolean
  additions: number
  deletions: number
}

export type UnderstandingSettings = {
  enabled: boolean
  triggerLevel: 'minor' | 'major'
  passingScore: number
  minimumQuestions: number
  maximumQuestions: number
  allowRetryBeforeRemediation: boolean
  requireBeforeAiApply: boolean
  requireBeforeCommit: boolean
  strictMode: boolean
  developerBypass: boolean
  bypassRequiresReason: boolean
}

export type UnderstandingQuestionType =
  | 'multiple_choice'
  | 'multiple_select'
  | 'true_false'
  | 'predict_behavior'
  | 'spot_the_bug'
  | 'short_answer'
  | 'code_ordering'

export type QuizOption = { id: string; label: string }
export type SourceReference = { path: string; startLine?: number; endLine?: number; label?: string }

export type PublicQuizQuestion = {
  id: string
  type: UnderstandingQuestionType
  conceptId: string
  prompt: string
  code?: string
  options?: QuizOption[]
  difficulty: 'easy' | 'medium' | 'hard'
  sourceReferences: SourceReference[]
}

export type PrivateQuizQuestion = PublicQuizQuestion & {
  correctAnswer: unknown
  explanation: string
  gradingRubric?: string
  weight: number
}

export type QuizConcept = {
  id: string
  name: string
  summary: string
}

export type UnderstandingQuiz = {
  id: string
  changeId: string
  source: ChangeSource
  fingerprint: string
  diffFingerprint: string
  quizVersion: number
  promptVersion: string
  modelIdentifier: string
  title: string
  summary: string
  whyThisMatters: string
  flowSummary: string
  risks: string[]
  concepts: QuizConcept[]
  questions: PublicQuizQuestion[]
  passingScore: number
  estimatedMinutes: number
  significance: ChangeSignificanceResult
  createdAt: string
  updatedAt: string
}

export type UnderstandingAnswer = { value: string | string[] | boolean; savedAt?: string }

export type UnderstandingSubmission = {
  quizId: string
  answers: Record<string, UnderstandingAnswer>
}

export type UnderstandingQuestionFeedback = {
  questionId: string
  correct: boolean
  explanation: string
  misconception?: string
}

export type UnderstandingResult = {
  quizId: string
  score: number
  passed: boolean
  attempt: number
  feedback: UnderstandingQuestionFeedback[]
  weakConceptIds: string[]
  remediation?: string
}

export type UnderstandingGateStatus = {
  changeId: string
  source: ChangeSource
  fingerprint: string
  state: 'not_required' | 'required' | 'in_progress' | 'remediation' | 'passed' | 'bypassed'
  quiz: UnderstandingQuiz | null
  draftAnswers: Record<string, UnderstandingAnswer>
  lastResult: UnderstandingResult | null
  unlocked: boolean
}

export type UnderstandingHistoryEntry = {
  id: string
  changeId: string
  source: ChangeSource
  title: string
  significance: ChangeSignificanceLevel
  score: number | null
  outcome: 'passed' | 'failed' | 'bypassed' | 'rejected'
  concepts: string[]
  completedAt: string
  durationSeconds?: number
  bypassReason?: string
}

export type KnowledgeMastery = {
  conceptId: string
  name: string
  mastery: number
  attempts: number
  correct: number
  updatedAt: string
  evidenceQuizIds: string[]
}

export type ChangeUnderstandingPreparation = {
  changeId: string
  fingerprint: string
  significance: ChangeSignificanceResult
  gate: UnderstandingGateStatus | null
  generationError?: string
}

export type UnderstandingOverview = {
  history: UnderstandingHistoryEntry[]
  mastery: KnowledgeMastery[]
}

export type StagedChangeAnalysis = ChangeUnderstandingPreparation & {
  repositoryRoot: string
  stagedFiles: string[]
}

export type CommitStagedRequest = {
  repositoryRoot: string
  message: string
}

export type CommitStagedResult = {
  commit: string
  summary: string
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
  understanding?: ChangeUnderstandingPreparation
}

export type AppliedProposal = {
  applied: boolean
  changedPaths: string[]
  workspace: WorkspaceSnapshot
}

export type AgentActivityState = 'pending' | 'active' | 'completed' | 'failed' | 'stopped'
export type AgentActivityPhase = 'context' | 'learning' | 'model' | 'validation' | 'quiz' | 'proposal' | 'approval' | 'apply' | 'complete'
export type AgentActivityFile = { path: string; action: 'create' | 'update' | 'applied' }
export type AgentActivityEvent = {
  id: string
  runId: string
  timestamp: string
  kind: 'phase' | 'protocol' | 'files'
  phase: AgentActivityPhase
  label: string
  state: AgentActivityState
  detail?: string
  protocolMethod?: string
  files?: AgentActivityFile[]
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
  prepareProposalQuiz: (proposalId: string) => Promise<ChangeUnderstandingPreparation>
  rejectProposal: (proposalId: string) => Promise<void>
  getUnderstandingSettings: () => Promise<UnderstandingSettings>
  saveUnderstandingSettings: (settings: UnderstandingSettings) => Promise<UnderstandingSettings>
  getUnderstandingHistory: () => Promise<UnderstandingOverview>
  getUnderstandingGate: (changeId: string, fingerprint?: string) => Promise<UnderstandingGateStatus | null>
  saveUnderstandingAnswers: (quizId: string, answers: Record<string, UnderstandingAnswer>) => Promise<UnderstandingGateStatus>
  submitUnderstanding: (submission: UnderstandingSubmission) => Promise<UnderstandingResult>
  bypassUnderstanding: (quizId: string, reason: string) => Promise<UnderstandingGateStatus>
  analyzeStagedChange: (repositoryRoot: string, forceNew?: boolean) => Promise<StagedChangeAnalysis>
  commitStagedChange: (request: CommitStagedRequest) => Promise<CommitStagedResult>
  onAgentActivity: (callback: (event: AgentActivityEvent) => void) => () => void
  cancelAgent: () => void
}
