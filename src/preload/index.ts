import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type AgentActivityEvent, type DesktopApi } from '../shared/contracts'

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
  startTerminal: () => ipcRenderer.invoke(IPC_CHANNELS.terminalStart),
  writeTerminal: (data) => ipcRenderer.send(IPC_CHANNELS.terminalWrite, data),
  stopTerminal: () => ipcRenderer.send(IPC_CHANNELS.terminalStop),
  onTerminalData: (callback) => {
    const listener = (_event: IpcRendererEvent, data: string) => callback(data)
    ipcRenderer.on(IPC_CHANNELS.terminalData, listener)
    return () => ipcRenderer.removeListener(IPC_CHANNELS.terminalData, listener)
  },
  onTerminalExit: (callback) => {
    const listener = (_event: IpcRendererEvent, exit: { code: number | null }) => callback(exit)
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
  applyProposal: (proposalId) => ipcRenderer.invoke(IPC_CHANNELS.agentApplyProposal, proposalId),
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
  cancelAgent: () => ipcRenderer.send(IPC_CHANNELS.agentCancel)
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
