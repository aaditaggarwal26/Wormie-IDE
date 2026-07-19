export const IPC_CHANNELS = {
  openWorkspace: 'workspace:open',
  restoreWorkspace: 'workspace:restore',
  refreshWorkspace: 'workspace:refresh',
  workspaceSetPurpose: 'workspace:set-purpose',
  readFile: 'workspace:read-file',
  writeFile: 'workspace:write-file',
  createEntry: 'workspace:create-entry',
  renameEntry: 'workspace:rename-entry',
  deleteEntry: 'workspace:delete-entry',
  searchWorkspace: 'workspace:search',
  replaceWorkspace: 'workspace:replace',
  listWorkspaceFiles: 'workspace:list-files',
  copyWorkspacePath: 'workspace:copy-path',
  watchWorkspaceFiles: 'workspace:watch-files',
  workspaceFileChanged: 'workspace:file-changed',
  editorRecoveryLoad: 'editor-recovery:load',
  editorRecoverySave: 'editor-recovery:save',
  gitStatus: 'git:status',
  gitTrustRepository: 'git:trust-repository',
  terminalStart: 'terminal:start',
  terminalWrite: 'terminal:write',
  terminalResize: 'terminal:resize',
  terminalStop: 'terminal:stop',
  terminalCopy: 'terminal:copy',
  terminalReadClipboard: 'terminal:read-clipboard',
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
  agentCancel: 'agent:cancel',
  assignmentGet: 'assignment:get',
  assignmentSave: 'assignment:save',
  assignmentReveal: 'assignment:reveal',
  assignmentExport: 'assignment:export',
  assignmentImport: 'assignment:import',
  assignmentStart: 'assignment:start',
  assignmentUpdateTask: 'assignment:update-task',
  assignmentSubmit: 'assignment:submit',
  assignmentOpenSubmission: 'assignment:open-submission',
  cloudGetAuth: 'cloud:get-auth',
  cloudAuthChanged: 'cloud:auth-changed',
  cloudGetPendingInvite: 'cloud:get-pending-invite',
  cloudInviteReceived: 'cloud:invite-received',
  cloudSignUp: 'cloud:sign-up',
  cloudSignIn: 'cloud:sign-in',
  cloudRequestPasswordReset: 'cloud:request-password-reset',
  cloudUpdatePassword: 'cloud:update-password',
  cloudSignInWithGoogle: 'cloud:sign-in-with-google',
  cloudSignOut: 'cloud:sign-out',
  cloudListClassrooms: 'cloud:list-classrooms',
  cloudCreateClassroom: 'cloud:create-classroom',
  cloudUpdateClassroom: 'cloud:update-classroom',
  cloudJoinClassroom: 'cloud:join-classroom',
  cloudRotateInvite: 'cloud:rotate-invite',
  cloudAddStudent: 'cloud:add-student',
  cloudRemoveStudent: 'cloud:remove-student',
  cloudLeaveClassroom: 'cloud:leave-classroom',
  cloudBeginAssignmentAuthoring: 'cloud:begin-assignment-authoring',
  cloudListClassroomMastery: 'cloud:list-classroom-mastery',
  cloudCopyInvite: 'cloud:copy-invite',
  cloudPublishAssignment: 'cloud:publish-assignment',
  cloudOpenAssignment: 'cloud:open-assignment'
} as const

export type WorkspacePurpose = 'sandbox' | 'assignment'

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
  fingerprint: string
}

export type WriteFileRequest = {
  filePath: string
  content: string
  expectedFingerprint: string
}

export type WrittenFile = {
  path: string
  fingerprint: string
}

export type FileViewState = {
  line: number
  column: number
  scrollTop: number
  scrollLeft: number
}

export type AutosaveSettings = {
  mode: 'off' | 'afterDelay' | 'onFocusChange'
  delayMs: number
}

export type EditorRecoveryDocument = {
  path: string
  dirtyContent?: string
  view?: FileViewState
}

export type EditorRecoveryState = {
  schemaVersion: 1
  workspaceRoot: string
  activePath: string | null
  autosave: AutosaveSettings
  documents: EditorRecoveryDocument[]
  closedPaths: string[]
}

export type WorkspaceFileChange = {
  workspaceRoot: string
  filePath: string
  kind: 'changed' | 'deleted'
  fingerprint: string | null
}

export type WorkspaceMutation = {
  workspace: WorkspaceSnapshot
  path: string
  previousPath?: string
}

export type SearchOptions = {
  requestId: string
  query: string
  replacement: string
  caseSensitive: boolean
  wholeWord: boolean
  useRegex: boolean
  includeGlobs: string[]
  excludeGlobs: string[]
  folderPath: string | null
}

export type SearchMatch = {
  id: string
  start: number
  end: number
  line: number
  column: number
  preview: string
  matchText: string
  replacement: string
}

export type WorkspaceSearchFile = {
  path: string
  relativePath: string
  fingerprint: string
  matches: SearchMatch[]
}

export type WorkspaceSearchResponse = {
  requestId: string
  workspaceRoot: string
  files: WorkspaceSearchFile[]
  totalMatches: number
  truncated: boolean
}

export type WorkspaceReplacementEdit = {
  start: number
  end: number
  expectedText: string
  replacement: string
}

export type WorkspaceReplacementFile = {
  filePath: string
  expectedFingerprint: string
  edits: WorkspaceReplacementEdit[]
}

export type WorkspaceReplacementRequest = {
  workspaceRoot: string
  files: WorkspaceReplacementFile[]
}

export type WorkspaceReplacementOutcome = {
  filePath: string
  status: 'applied' | 'failed'
  replacements: number
  message?: string
  fingerprint?: string
}

export type WorkspaceReplacementResponse = {
  workspaceRoot: string
  outcomes: WorkspaceReplacementOutcome[]
}

export type WorkspaceFileEntry = {
  path: string
  relativePath: string
  name: string
}

export type WorkspaceFileList = {
  workspaceRoot: string
  files: WorkspaceFileEntry[]
  truncated: boolean
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

export type GitRepositoryProblem = {
  rootPath: string
  name: string
  relativePath: string
  kind: 'unsafe-ownership' | 'unavailable'
  message: string
}

export type GitStatusSnapshot = {
  workspaceRoot: string
  repositories: GitRepositorySnapshot[]
  problems: GitRepositoryProblem[]
}

export type TerminalSessionRequest = {
  sessionId: string
  columns: number
  rows: number
}

export type TerminalSessionInfo = {
  sessionId: string
  shellName: string
}

export type TerminalWriteRequest = {
  sessionId: string
  data: string
}

export type TerminalResizeRequest = TerminalSessionRequest

export type TerminalData = {
  sessionId: string
  data: string
}

export type TerminalExit = {
  sessionId: string
  code: number | null
  signal: number | null
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
  originalContent: string | null
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

export type ReviewedProposalFile = {
  relativePath: string
  content: string
  keptBlocks: number
  undoneBlocks: number
}

export type ApplyProposalRequest = {
  proposalId: string
  files: ReviewedProposalFile[]
}

export type AppliedProposal = {
  applied: boolean
  changedPaths: string[]
  workspace: WorkspaceSnapshot
}

export type AssignmentTaskKind = 'implement' | 'fix' | 'create' | 'explain'

export type AssignmentTask = {
  id: string
  title: string
  description: string
  filePath: string
  kind: AssignmentTaskKind
  acceptanceCriteria: string[]
}

export type AssignmentAiPolicy =
  | { mode: 'learning-gated'; passingScore: number; allowGeneration: boolean }
  | { mode: 'disabled'; passingScore: number; allowGeneration: false }

export type AssignmentEvidencePolicy = {
  includeAiActivity: boolean
  includeFileSnapshots: boolean
}

export type AssignmentManifest = {
  schemaVersion: 1
  id: string
  title: string
  summary: string
  instructions: string
  createdAt: string
  updatedAt: string
  tasks: AssignmentTask[]
  aiPolicy: AssignmentAiPolicy
  evidencePolicy: AssignmentEvidencePolicy
}

export type AssignmentManifestDraft = Omit<
  AssignmentManifest,
  'schemaVersion' | 'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string
}

export type AssignmentWorkspaceState = {
  workspaceRoot: string
  role: 'teacher' | 'student'
  manifest: AssignmentManifest | null
  manifestPath: string | null
  revision: string | null
  progress: AssignmentProgress | null
  error?: string
  progressError?: string
}

export type AssignmentTaskProgress = {
  status: 'not-started' | 'in-progress' | 'completed'
  notes: string
  updatedAt: string
  completedAt?: string
}

export type AssignmentProgress = {
  schemaVersion: 1
  revision: string
  assignmentId: string
  assignmentRevision: string
  student: { id: string; name: string }
  startedAt: string
  updatedAt: string
  status: 'in-progress' | 'submitted'
  evidenceConsent: AssignmentEvidencePolicy & { acceptedAt: string }
  tasks: Record<string, AssignmentTaskProgress>
}

export type AssignmentTaskProgressUpdate = {
  taskId: string
  status: AssignmentTaskProgress['status']
  notes: string
}

export type AssignmentStartRequest = {
  workspaceRoot: string
  assignmentId: string
  assignmentRevision: string
  studentName: string
  evidenceConsent: AssignmentEvidencePolicy
}

export type AssignmentTaskProgressRequest = {
  workspaceRoot: string
  assignmentId: string
  assignmentRevision: string
  expectedProgressRevision: string
  update: AssignmentTaskProgressUpdate
}

export type AssignmentSubmitRequest = {
  workspaceRoot: string
  assignmentId: string
  assignmentRevision: string
  expectedProgressRevision: string
}

export type AssignmentAiActivity =
  | { id: string; occurredAt: string; type: 'learning'; request: string; concepts: string[]; lessonSummary: string }
  | { id: string; occurredAt: string; type: 'quiz'; sessionId: string; score: number; passed: boolean }
  | { id: string; occurredAt: string; type: 'proposal'; sessionId: string; proposalId: string; summary: string; paths: string[] }
  | { id: string; occurredAt: string; type: 'apply'; proposalId: string; applied: boolean; paths: string[] }

export type AssignmentSubmissionFile = {
  path: string
  contentBase64: string
  sha256: string
  bytes: number
}

export type AssignmentSubmission = {
  schemaVersion: 1
  id: string
  assignmentId: string
  assignmentRevision: string
  assignmentTitle: string
  submittedAt: string
  student: AssignmentProgress['student']
  progress: AssignmentProgress
  aiActivity: AssignmentAiActivity[]
  files: AssignmentSubmissionFile[]
}

export type AssignmentSubmissionExportResult = {
  filePath: string
  submission: AssignmentSubmission
}

export type AssignmentSaveRequest = {
  workspaceRoot: string
  draft: AssignmentManifestDraft
  expectedRevision: string | null
  replaceInvalid: boolean
}

export type AssignmentExportResult = {
  filePath: string
  fileCount: number
  totalBytes: number
}

export type AssignmentImportResult = {
  workspace: WorkspaceSnapshot
  assignmentTitle: string
  fileCount: number
}

export type CloudUser = {
  id: string
  email: string
}

export type CloudAuthState = {
  user: CloudUser | null
  emailConfirmationRequired?: boolean
  passwordResetRequired?: boolean
}

export type CloudAuthUpdate = {
  auth: CloudAuthState | null
  error: string | null
}

export type CloudAuthCredentials = {
  email: string
  password: string
}

export type ClassroomMember = {
  userId: string
  email: string | null
  displayName: string
  role: 'teacher' | 'student'
  joinedAt: string
}

export type ClassroomAssignment = {
  id: string
  localAssignmentId: string
  title: string
  summary: string
  publishedAt: string
  publishedBy: string
}

export type Classroom = {
  id: string
  name: string
  description: string
  ownerId: string
  role: 'teacher' | 'student'
  inviteCode: string | null
  inviteLink: string | null
  createdAt: string
  members: ClassroomMember[]
  assignments: ClassroomAssignment[]
}

export type ClassroomCreateRequest = {
  name: string
  description: string
}

export type ClassroomUpdateRequest = ClassroomCreateRequest & {
  classroomId: string
}

export type ClassroomPublishRequest = {
  classroomId: string
  workspaceRoot: string
}

export type ClassroomAssignmentContext = {
  classroomId: string
  classroomName: string
  assignmentId: string | null
  assignmentTitle: string
  role: 'teacher' | 'student'
}

export type ClassroomOpenAssignmentResult = AssignmentImportResult & { context: ClassroomAssignmentContext }

export type ClassroomMasteryConcept = {
  studentId: string
  conceptId: string
  conceptName: string
  mastery: number
  attempts: number
  correct: number
  updatedAt: string
}

export type ClassroomMasteryEvent = {
  studentId: string
  assignmentId: string | null
  quizId: string
  attempt: number
  score: number
  passed: boolean
  title: string
  completedAt: string
}

export type ClassroomMasterySnapshot = {
  classroomId: string
  concepts: ClassroomMasteryConcept[]
  events: ClassroomMasteryEvent[]
  pendingSyncCount: number
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
  setWorkspacePurpose: (purpose: WorkspacePurpose) => Promise<void>
  openWorkspace: (purpose?: WorkspacePurpose) => Promise<WorkspaceSnapshot | null>
  restoreWorkspace: () => Promise<WorkspaceSnapshot | null>
  refreshWorkspace: () => Promise<WorkspaceSnapshot>
  readFile: (filePath: string) => Promise<OpenFile>
  writeFile: (request: WriteFileRequest) => Promise<WrittenFile>
  createEntry: (parentPath: string, name: string, type: 'file' | 'directory') => Promise<WorkspaceMutation>
  renameEntry: (entryPath: string, name: string) => Promise<WorkspaceMutation>
  deleteEntry: (entryPath: string) => Promise<WorkspaceMutation | null>
  searchWorkspace: (options: SearchOptions) => Promise<WorkspaceSearchResponse>
  replaceWorkspace: (request: WorkspaceReplacementRequest) => Promise<WorkspaceReplacementResponse>
  listWorkspaceFiles: () => Promise<WorkspaceFileList>
  copyWorkspacePath: (filePath: string, kind: 'absolute' | 'relative') => Promise<void>
  watchWorkspaceFiles: (filePaths: string[]) => Promise<void>
  onWorkspaceFileChanged: (callback: (change: WorkspaceFileChange) => void) => () => void
  loadEditorRecovery: (workspaceRoot: string) => Promise<EditorRecoveryState | null>
  saveEditorRecovery: (state: EditorRecoveryState) => Promise<void>
  getGitStatus: () => Promise<GitStatusSnapshot>
  trustGitRepository: (repositoryRoot: string) => Promise<void>
  startTerminal: (request: TerminalSessionRequest) => Promise<TerminalSessionInfo>
  writeTerminal: (sessionId: string, data: string) => void
  resizeTerminal: (sessionId: string, columns: number, rows: number) => void
  stopTerminal: (sessionId: string) => void
  copyTerminalText: (text: string) => Promise<void>
  readTerminalClipboard: () => Promise<string>
  onTerminalData: (callback: (event: TerminalData) => void) => () => void
  onTerminalExit: (callback: (event: TerminalExit) => void) => () => void
  getAgentConfig: () => Promise<AgentConfig>
  saveAgentConfig: (config: AgentConfigUpdate) => Promise<AgentConfig>
  setAgentPassingScore: (score: number) => Promise<number>
  getCodexAccount: () => Promise<CodexAccountStatus>
  connectCodexAccount: () => Promise<CodexAccountStatus>
  startLearning: (request: LearningRequest) => Promise<LearningSession>
  submitQuiz: (submission: QuizSubmission) => Promise<QuizResult>
  generateProposal: (sessionId: string) => Promise<CodeProposal>
  applyProposal: (request: ApplyProposalRequest) => Promise<AppliedProposal>
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
  getAssignment: (workspaceRoot: string) => Promise<AssignmentWorkspaceState>
  saveAssignment: (request: AssignmentSaveRequest) => Promise<AssignmentWorkspaceState>
  revealAssignment: () => Promise<void>
  exportAssignment: () => Promise<AssignmentExportResult | null>
  importAssignment: () => Promise<AssignmentImportResult | null>
  startAssignment: (request: AssignmentStartRequest) => Promise<AssignmentProgress>
  updateAssignmentTask: (request: AssignmentTaskProgressRequest) => Promise<AssignmentProgress>
  submitAssignment: (request: AssignmentSubmitRequest) => Promise<AssignmentSubmissionExportResult | null>
  openAssignmentSubmission: (workspaceRoot: string) => Promise<AssignmentSubmission | null>
  getCloudAuth: () => Promise<CloudAuthState>
  onCloudAuthChanged: (callback: (update: CloudAuthUpdate) => void) => () => void
  getPendingClassroomInvite: () => Promise<string | null>
  onClassroomInvite: (callback: (inviteLink: string) => void) => () => void
  signUp: (credentials: CloudAuthCredentials) => Promise<CloudAuthState>
  signIn: (credentials: CloudAuthCredentials) => Promise<CloudAuthState>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<CloudAuthState>
  signInWithGoogle: () => Promise<void>
  signOut: () => Promise<void>
  listClassrooms: () => Promise<Classroom[]>
  createClassroom: (request: ClassroomCreateRequest) => Promise<Classroom[]>
  updateClassroom: (request: ClassroomUpdateRequest) => Promise<Classroom[]>
  joinClassroom: (invite: string) => Promise<Classroom[]>
  rotateClassroomInvite: (classroomId: string) => Promise<Classroom[]>
  addClassroomStudent: (classroomId: string, email: string) => Promise<Classroom[]>
  removeClassroomStudent: (classroomId: string, userId: string) => Promise<Classroom[]>
  leaveClassroom: (classroomId: string) => Promise<Classroom[]>
  beginClassroomAssignmentAuthoring: (classroomId: string) => Promise<ClassroomAssignmentContext>
  listClassroomMastery: (classroomId: string) => Promise<ClassroomMasterySnapshot>
  copyClassroomInvite: (inviteLink: string) => Promise<void>
  publishAssignment: (request: ClassroomPublishRequest) => Promise<Classroom[]>
  openClassroomAssignment: (assignmentId: string) => Promise<ClassroomOpenAssignmentResult | null>
}
