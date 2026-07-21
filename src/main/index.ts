import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import Store from 'electron-store'
import { registerAgentHandlers, type AgentClassroomAnalyticsInput, type AgentClassroomAnalyticsScope } from './agent'
import { registerAssignmentHandlers } from './assignments'
import { registerCloudHandlers } from './cloud'
import { registerGitHandlers } from './git'
import { createRendererUrlValidator } from './ipcTrust'
import type { AppPreferences } from './preferences'
import { registerTerminalHandlers } from './terminal'
import { UnderstandingController } from './understanding'
import { UnderstandingRepository } from './understanding/store'
import { registerEditorRecoveryHandlers } from './editorRecovery'
import { MasteryRepository } from './mastery/repository'
import { MasteryService } from './mastery/service'
import { KnowledgeGraph } from './mastery/graph'
import { canonicalConcepts } from './mastery/catalog'
import { registerMasteryIpc } from './mastery/ipc'
import { registerWorkspaceHandlers } from './workspace'
import { IPC_CHANNELS, type ClassroomAssignmentContext, type CloudAuthUpdate, type WorkspacePurpose } from '../shared/contracts'
import { classroomInviteFromArguments, classroomInviteLink } from './cloud/invite'
import { MasterySyncQueue } from './cloud/masterySync'
import { AiAnalyticsSyncQueue, type AiAnalyticsSyncEvent } from './cloud/aiAnalyticsSync'
import {
  authCallback,
  authCallbackFromArguments,
  type AuthCallback
} from './cloud/oauth'

const store = new Store<AppPreferences>({ name: 'preferences' })
const trustedWebContents = new Set<number>()
const rendererFilePath = path.join(__dirname, '../renderer/index.html')
const devIconPath = path.join(__dirname, '../../build/icon.png')
const isTrustedRendererUrl = createRendererUrlValidator(process.env.ELECTRON_RENDERER_URL, rendererFilePath)
const understandingStore = new Store({ name: 'understanding-state' })
const editorRecoveryStore = new Store<{ state?: unknown }>({ name: 'editor-recovery' })
const masterySyncStore = new Store<{ queue?: unknown }>({ name: 'mastery-sync' })
const masterySyncQueue = new MasterySyncQueue(masterySyncStore)
const analyticsSyncStore = new Store<{ queue?: unknown }>({ name: 'classroom-ai-analytics-sync' })
const analyticsSyncQueue = new AiAnalyticsSyncQueue(analyticsSyncStore)
let workspacePurpose: WorkspacePurpose = 'sandbox'
let activeAssignmentContext: (ClassroomAssignmentContext & { userId: string }) | null = null
const understandingRepository = new UnderstandingRepository(understandingStore)
const masteryStore = new Store({ name: 'mastery-state' })
const masteryRepository = new MasteryRepository(masteryStore, Object.values(understandingRepository.read().mastery))
const mastery = new MasteryService(masteryRepository, new KnowledgeGraph(canonicalConcepts))
const understanding = new UnderstandingController(understandingRepository, mastery, () => {
  if (!activeAssignmentContext || activeAssignmentContext.role !== 'student') return null
  return {
    classroomId: activeAssignmentContext.classroomId,
    assignmentId: activeAssignmentContext.assignmentId,
    userId: activeAssignmentContext.userId
  }
})
let pendingClassroomInvite = classroomInviteFromArguments(process.argv)
let pendingAuthCallback = authCallbackFromArguments(process.argv)
let handleAuthCallback: ((callback: AuthCallback) => Promise<void>) | null = null
let recordAiAnalyticsEvent: ((event: AiAnalyticsSyncEvent) => void) | null = null
const isTrustedSender = (event: IpcMainEvent | IpcMainInvokeEvent) =>
  trustedWebContents.has(event.sender.id) &&
  event.senderFrame === event.sender.mainFrame &&
  isTrustedRendererUrl(event.senderFrame.url)

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
  return normalize(left) === normalize(right)
}

for (const protocol of ['wormie', 'wormie-ide']) {
  if (process.defaultApp) {
    if (process.argv[1]) app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])])
  } else {
    app.setAsDefaultProtocolClient(protocol)
  }
}

function queueClassroomInvite(value: string): void {
  const inviteLink = classroomInviteLink(value)
  if (!inviteLink) return
  pendingClassroomInvite = inviteLink
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.cloudInviteReceived, inviteLink)
  }
}

function takePendingClassroomInvite(): string | null {
  const inviteLink = pendingClassroomInvite
  pendingClassroomInvite = null
  return inviteLink
}

function queueAuthCallback(callback: AuthCallback): void {
  if (handleAuthCallback) {
    void handleAuthCallback(callback)
    return
  }
  pendingAuthCallback = callback
}

function notifyCloudAuthChanged(update: CloudAuthUpdate): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (!window.isDestroyed()) window.webContents.send(IPC_CHANNELS.cloudAuthChanged, update)
  }
}

app.on('open-url', (event, url) => {
  event.preventDefault()
  const callback = authCallback(url)
  if (callback) queueAuthCallback(callback)
  else queueClassroomInvite(url)
})

function createWindow(): void {
  const savedBounds = store.get('windowBounds')
  const mainWindow = new BrowserWindow({
    width: savedBounds?.width ?? 1440,
    height: savedBounds?.height ?? 900,
    minWidth: 1040,
    minHeight: 680,
    title: 'Wormie',
    icon: app.isPackaged ? undefined : devIconPath,
    backgroundColor: '#090b0d',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    trafficLightPosition: process.platform === 'darwin' ? { x: 17, y: 14 } : undefined,
    titleBarOverlay:
      process.platform === 'darwin'
        ? undefined
        : { color: '#090b0d', symbolColor: '#a9b2b9', height: 42 },
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  const webContentsId = mainWindow.webContents.id
  let allowClose = process.argv.includes('--smoke-test')
  let closeRequestPending = false
  trustedWebContents.add(webContentsId)
  mainWindow.webContents.once('destroyed', () => trustedWebContents.delete(webContentsId))

  const finishClose = (event: IpcMainEvent, proceed: unknown): void => {
    if (!isTrustedSender(event) || event.sender.id !== webContentsId || typeof proceed !== 'boolean') return
    closeRequestPending = false
    if (!proceed || mainWindow.isDestroyed()) return
    allowClose = true
    mainWindow.close()
  }
  ipcMain.on(IPC_CHANNELS.appCloseReady, finishClose)
  mainWindow.once('closed', () => ipcMain.removeListener(IPC_CHANNELS.appCloseReady, finishClose))

  mainWindow.once('ready-to-show', () => {
    if (process.argv.includes('--smoke-test')) {
      app.quit()
      return
    }
    mainWindow.show()
  })
  mainWindow.on('close', (event) => {
    const { width, height } = mainWindow.getBounds()
    store.set('windowBounds', { width, height })
    if (allowClose || mainWindow.webContents.isDestroyed()) return
    event.preventDefault()
    if (closeRequestPending) return
    closeRequestPending = true
    mainWindow.webContents.send(IPC_CHANNELS.appBeforeClose)
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url)
    return { action: 'deny' }
  })
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isTrustedRendererUrl(url)) event.preventDefault()
  })
  mainWindow.webContents.on('will-prevent-unload', (event) => {
    const response = dialog.showMessageBoxSync(mainWindow, {
      type: 'warning',
      title: 'Unsaved work',
      message: 'Quit Wormie with unsaved work?',
      detail: 'Choose Cancel to return to the editor and save. Recent eligible editor text may also be available for recovery.',
      buttons: ['Quit without saving', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    })
    if (response === 0) event.preventDefault()
    else allowClose = false
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(rendererFilePath)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const workspace = registerWorkspaceHandlers(store, isTrustedSender, () => workspacePurpose)
  ipcMain.handle(IPC_CHANNELS.workspaceSetPurpose, (event, purpose: unknown): void => {
    if (!isTrustedSender(event)) throw new Error('Untrusted renderer request.')
    if (purpose !== 'sandbox' && purpose !== 'assignment') throw new Error('Invalid workspace purpose.')
    workspacePurpose = purpose
    if (purpose === 'sandbox') activeAssignmentContext = null
  })
  const progressStorageRoot = path.join(app.getPath('userData'), 'assignment-progress')
  registerEditorRecoveryHandlers(editorRecoveryStore, workspace.getWorkspaceRoot, isTrustedSender)
  registerAssignmentHandlers(
    store,
    progressStorageRoot,
    workspace.getWorkspaceRoot,
    workspace.setWorkspace,
    isTrustedSender
  )
  understanding.registerIpc(isTrustedSender)
  registerMasteryIpc(mastery, isTrustedSender)
  registerGitHandlers(workspace.getWorkspaceRoot, understanding, isTrustedSender)
  registerTerminalHandlers(workspace.getWorkspaceRoot, isTrustedSender)
  const getClassroomAnalyticsScope = (): AgentClassroomAnalyticsScope | null => {
    const rootPath = workspace.getWorkspaceRoot()
    if (!rootPath || workspacePurpose !== 'assignment' || !activeAssignmentContext || activeAssignmentContext.role !== 'student' || !activeAssignmentContext.assignmentId) return null
    return {
      classroomId: activeAssignmentContext.classroomId,
      studentId: activeAssignmentContext.userId,
      assignmentId: activeAssignmentContext.assignmentId,
      workspaceRoot: rootPath
    }
  }
  const queueClassroomAnalytics = (scope: AgentClassroomAnalyticsScope, input: AgentClassroomAnalyticsInput): void => {
    const currentScope = getClassroomAnalyticsScope()
    if (!currentScope || currentScope.classroomId !== scope.classroomId || currentScope.studentId !== scope.studentId || currentScope.assignmentId !== scope.assignmentId || !samePath(currentScope.workspaceRoot, scope.workspaceRoot)) return
    const usage = input.eventType === 'quiz'
      ? { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningOutputTokens: 0, totalTokens: 0, reportedCredits: null }
      : {
          inputTokens: input.usage.inputTokens,
          cachedInputTokens: input.usage.cachedInputTokens ?? 0,
          outputTokens: input.usage.outputTokens,
          reasoningOutputTokens: input.usage.reasoningOutputTokens ?? 0,
          totalTokens: input.usage.totalTokens,
          reportedCredits: input.usage.reportedCredits ?? null
        }
    recordAiAnalyticsEvent?.({
      eventKey: randomUUID(),
      classroomId: scope.classroomId,
      studentId: scope.studentId,
      assignmentId: scope.assignmentId,
      sessionId: input.sessionId,
      eventType: input.eventType,
      mode: input.eventType === 'request' ? input.mode : null,
      requestLength: input.eventType === 'request' ? input.requestLength : null,
      requestScope: input.eventType === 'request' ? input.requestScope : null,
      quizQuestionCount: input.eventType === 'request' || input.eventType === 'quiz' ? input.quizQuestionCount : null,
      quizScore: input.eventType === 'quiz' ? input.quizScore : null,
      passed: input.eventType === 'quiz' ? input.passed : null,
      model: input.model,
      ...usage,
      occurredAt: new Date().toISOString()
    })
  }
  registerAgentHandlers(store, workspace.getWorkspaceRoot, () => workspacePurpose, understanding, progressStorageRoot, mastery, getClassroomAnalyticsScope, queueClassroomAnalytics, isTrustedSender)

  app.on('second-instance', (_event, commandLine) => {
    const callback = authCallbackFromArguments(commandLine)
    if (callback) queueAuthCallback(callback)
    const inviteLink = classroomInviteFromArguments(commandLine)
    if (inviteLink) queueClassroomInvite(inviteLink)
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    if (process.platform === 'darwin' && !app.isPackaged) app.dock?.setIcon(devIconPath)
    const cloud = registerCloudHandlers(
      workspace.getWorkspaceRoot,
      workspace.setWorkspace,
      () => workspacePurpose,
      (context) => { activeAssignmentContext = context },
      masterySyncQueue,
      analyticsSyncQueue,
      isTrustedSender,
      takePendingClassroomInvite,
      notifyCloudAuthChanged
    )
    understanding.setCompletionListener(cloud.recordUnderstandingCompletion)
    recordAiAnalyticsEvent = cloud.recordAiAnalyticsEvent
    handleAuthCallback = cloud.handleAuthCallback
    createWindow()
    if (pendingAuthCallback) {
      const callback = pendingAuthCallback
      pendingAuthCallback = null
      void handleAuthCallback(callback)
    }
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
