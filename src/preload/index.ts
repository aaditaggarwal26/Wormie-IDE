import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import {
  IPC_CHANNELS,
  type AgentActivityEvent,
  type CloudAuthUpdate,
  type DesktopApi,
  type TerminalData,
  type TerminalExit
} from '../shared/contracts'

const desktopApi: DesktopApi = {
  platform: process.platform,
  openWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.openWorkspace),
  restoreWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.restoreWorkspace),
  refreshWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.refreshWorkspace),
  readFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.readFile, filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke(IPC_CHANNELS.writeFile, filePath, content),
  createEntry: (parentPath, name, type) => ipcRenderer.invoke(IPC_CHANNELS.createEntry, parentPath, name, type),
  renameEntry: (entryPath, name) => ipcRenderer.invoke(IPC_CHANNELS.renameEntry, entryPath, name),
  deleteEntry: (entryPath) => ipcRenderer.invoke(IPC_CHANNELS.deleteEntry, entryPath),
  searchWorkspace: (query) => ipcRenderer.invoke(IPC_CHANNELS.searchWorkspace, query),
  getGitStatus: () => ipcRenderer.invoke(IPC_CHANNELS.gitStatus),
  trustGitRepository: (repositoryRoot) => ipcRenderer.invoke(IPC_CHANNELS.gitTrustRepository, repositoryRoot),
  startTerminal: (request) => ipcRenderer.invoke(IPC_CHANNELS.terminalStart, request),
  writeTerminal: (sessionId, data) => ipcRenderer.send(IPC_CHANNELS.terminalWrite, { sessionId, data }),
  resizeTerminal: (sessionId, columns, rows) => ipcRenderer.send(IPC_CHANNELS.terminalResize, { sessionId, columns, rows }),
  stopTerminal: (sessionId) => ipcRenderer.send(IPC_CHANNELS.terminalStop, sessionId),
  copyTerminalText: (text) => ipcRenderer.invoke(IPC_CHANNELS.terminalCopy, text),
  readTerminalClipboard: () => ipcRenderer.invoke(IPC_CHANNELS.terminalReadClipboard),
  onTerminalData: (callback) => {
    const listener = (_event: IpcRendererEvent, data: TerminalData) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.terminalData, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.terminalData, listener)
  },
  onTerminalExit: (callback) => {
    const listener = (_event: IpcRendererEvent, exit: TerminalExit) => callback(exit)
    ipcRenderer.on(IPC_CHANNELS.terminalExit, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.terminalExit, listener)
  },
  getAgentConfig: () => ipcRenderer.invoke(IPC_CHANNELS.agentGetConfig),
  saveAgentConfig: (config) => ipcRenderer.invoke(IPC_CHANNELS.agentSaveConfig, config),
  setAgentPassingScore: (score) => ipcRenderer.invoke(IPC_CHANNELS.agentSetPassingScore, score),
  getCodexAccount: () => ipcRenderer.invoke(IPC_CHANNELS.agentGetCodexAccount),
  connectCodexAccount: () => ipcRenderer.invoke(IPC_CHANNELS.agentConnectCodexAccount),
  startLearning: (request) => ipcRenderer.invoke(IPC_CHANNELS.agentStartLearning, request),
  submitQuiz: (submission) => ipcRenderer.invoke(IPC_CHANNELS.agentSubmitQuiz, submission),
  generateProposal: (sessionId) => ipcRenderer.invoke(IPC_CHANNELS.agentGenerateProposal, sessionId),
  applyProposal: (request) => ipcRenderer.invoke(IPC_CHANNELS.agentApplyProposal, request),
  prepareProposalQuiz: (proposalId) => ipcRenderer.invoke(IPC_CHANNELS.agentPrepareProposalQuiz, proposalId),
  rejectProposal: (proposalId) => ipcRenderer.invoke(IPC_CHANNELS.agentRejectProposal, proposalId),
  getUnderstandingSettings: () => ipcRenderer.invoke(IPC_CHANNELS.understandingGetSettings),
  saveUnderstandingSettings: (settings) => ipcRenderer.invoke(IPC_CHANNELS.understandingSaveSettings, settings),
  getUnderstandingHistory: () => ipcRenderer.invoke(IPC_CHANNELS.understandingGetHistory),
  getUnderstandingGate: (changeId, fingerprint) => ipcRenderer.invoke(IPC_CHANNELS.understandingGetGate, changeId, fingerprint),
  saveUnderstandingAnswers: (quizId, answers) => ipcRenderer.invoke(IPC_CHANNELS.understandingSaveAnswers, quizId, answers),
  submitUnderstanding: (submission) => ipcRenderer.invoke(IPC_CHANNELS.understandingSubmit, submission),
  bypassUnderstanding: (quizId, reason) => ipcRenderer.invoke(IPC_CHANNELS.understandingBypass, quizId, reason),
  analyzeStagedChange: (repositoryRoot, forceNew) => ipcRenderer.invoke(IPC_CHANNELS.gitAnalyzeStaged, repositoryRoot, forceNew),
  commitStagedChange: (request) => ipcRenderer.invoke(IPC_CHANNELS.gitCommitStaged, request),
  onAgentActivity: (callback) => {
    const listener = (_event: IpcRendererEvent, activity: AgentActivityEvent) => callback(activity)
    ipcRenderer.on(IPC_CHANNELS.agentActivity, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.agentActivity, listener)
  },
  cancelAgent: () => ipcRenderer.send(IPC_CHANNELS.agentCancel),
  getAssignment: (workspaceRoot) => ipcRenderer.invoke(IPC_CHANNELS.assignmentGet, workspaceRoot),
  saveAssignment: (request) => ipcRenderer.invoke(IPC_CHANNELS.assignmentSave, request),
  revealAssignment: () => ipcRenderer.invoke(IPC_CHANNELS.assignmentReveal),
  exportAssignment: () => ipcRenderer.invoke(IPC_CHANNELS.assignmentExport),
  importAssignment: () => ipcRenderer.invoke(IPC_CHANNELS.assignmentImport),
  startAssignment: (request) => ipcRenderer.invoke(IPC_CHANNELS.assignmentStart, request),
  updateAssignmentTask: (request) => ipcRenderer.invoke(IPC_CHANNELS.assignmentUpdateTask, request),
  submitAssignment: (request) => ipcRenderer.invoke(IPC_CHANNELS.assignmentSubmit, request),
  openAssignmentSubmission: (workspaceRoot) => ipcRenderer.invoke(IPC_CHANNELS.assignmentOpenSubmission, workspaceRoot),
  getCloudAuth: () => ipcRenderer.invoke(IPC_CHANNELS.cloudGetAuth),
  onCloudAuthChanged: (callback) => {
    const listener = (_event: IpcRendererEvent, update: CloudAuthUpdate) => callback(update)
    ipcRenderer.on(IPC_CHANNELS.cloudAuthChanged, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.cloudAuthChanged, listener)
  },
  getPendingClassroomInvite: () => ipcRenderer.invoke(IPC_CHANNELS.cloudGetPendingInvite),
  onClassroomInvite: (callback) => {
    const listener = (_event: IpcRendererEvent, inviteLink: string) => {
      callback(inviteLink)
      void ipcRenderer.invoke(IPC_CHANNELS.cloudGetPendingInvite).catch(() => undefined)
    }
    ipcRenderer.on(IPC_CHANNELS.cloudInviteReceived, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.cloudInviteReceived, listener)
  },
  signUp: (credentials) => ipcRenderer.invoke(IPC_CHANNELS.cloudSignUp, credentials),
  signIn: (credentials) => ipcRenderer.invoke(IPC_CHANNELS.cloudSignIn, credentials),
  requestPasswordReset: (email) => ipcRenderer.invoke(IPC_CHANNELS.cloudRequestPasswordReset, email),
  updatePassword: (password) => ipcRenderer.invoke(IPC_CHANNELS.cloudUpdatePassword, password),
  signInWithGoogle: () => ipcRenderer.invoke(IPC_CHANNELS.cloudSignInWithGoogle),
  signOut: () => ipcRenderer.invoke(IPC_CHANNELS.cloudSignOut),
  listClassrooms: () => ipcRenderer.invoke(IPC_CHANNELS.cloudListClassrooms),
  createClassroom: (request) => ipcRenderer.invoke(IPC_CHANNELS.cloudCreateClassroom, request),
  joinClassroom: (invite) => ipcRenderer.invoke(IPC_CHANNELS.cloudJoinClassroom, invite),
  rotateClassroomInvite: (classroomId) => ipcRenderer.invoke(IPC_CHANNELS.cloudRotateInvite, classroomId),
  copyClassroomInvite: (inviteLink) => ipcRenderer.invoke(IPC_CHANNELS.cloudCopyInvite, inviteLink),
  publishAssignment: (request) => ipcRenderer.invoke(IPC_CHANNELS.cloudPublishAssignment, request),
  openClassroomAssignment: (assignmentId) => ipcRenderer.invoke(IPC_CHANNELS.cloudOpenAssignment, assignmentId)
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
