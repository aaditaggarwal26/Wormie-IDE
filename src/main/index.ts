import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainEvent, type IpcMainInvokeEvent } from 'electron'
import Store from 'electron-store'
import { registerAgentHandlers } from './agent'
import { registerAssignmentHandlers } from './assignments'
import { registerCloudHandlers } from './cloud'
import { registerGitHandlers } from './git'
import { createRendererUrlValidator } from './ipcTrust'
import type { AppPreferences } from './preferences'
import { registerTerminalHandlers } from './terminal'
import { UnderstandingController } from './understanding'
import { UnderstandingRepository } from './understanding/store'
import { registerEditorRecoveryHandlers } from './editorRecovery'
import { registerWorkspaceHandlers } from './workspace'
import { IPC_CHANNELS, type CloudAuthUpdate, type WorkspacePurpose } from '../shared/contracts'
import { classroomInviteFromArguments, classroomInviteLink } from './cloud/invite'
import {
  authCallback,
  authCallbackFromArguments,
  type AuthCallback
} from './cloud/oauth'

const store = new Store<AppPreferences>({ name: 'preferences' })
const trustedWebContents = new Set<number>()
const rendererFilePath = path.join(__dirname, '../renderer/index.html')
const isTrustedRendererUrl = createRendererUrlValidator(process.env.ELECTRON_RENDERER_URL, rendererFilePath)
const understandingStore = new Store({ name: 'understanding-state' })
const editorRecoveryStore = new Store<{ state?: unknown }>({ name: 'editor-recovery' })
const understanding = new UnderstandingController(new UnderstandingRepository(understandingStore))
let workspacePurpose: WorkspacePurpose = 'sandbox'
let pendingClassroomInvite = classroomInviteFromArguments(process.argv)
let pendingAuthCallback = authCallbackFromArguments(process.argv)
let handleAuthCallback: ((callback: AuthCallback) => Promise<void>) | null = null
const isTrustedSender = (event: IpcMainEvent | IpcMainInvokeEvent) =>
  trustedWebContents.has(event.sender.id) &&
  event.senderFrame === event.sender.mainFrame &&
  isTrustedRendererUrl(event.senderFrame.url)

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
    backgroundColor: '#090b0d',
    show: false,
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
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
  trustedWebContents.add(webContentsId)
  mainWindow.webContents.once('destroyed', () => trustedWebContents.delete(webContentsId))

  mainWindow.once('ready-to-show', () => {
    if (process.argv.includes('--smoke-test')) {
      app.quit()
      return
    }
    mainWindow.show()
  })
  mainWindow.on('close', () => {
    const { width, height } = mainWindow.getBounds()
    store.set('windowBounds', { width, height })
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
  const workspace = registerWorkspaceHandlers(store, isTrustedSender)
  ipcMain.handle(IPC_CHANNELS.workspaceSetPurpose, (event, purpose: unknown): void => {
    if (!isTrustedSender(event)) throw new Error('Untrusted renderer request.')
    if (purpose !== 'sandbox' && purpose !== 'assignment') throw new Error('Invalid workspace purpose.')
    workspacePurpose = purpose
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
  understanding.registerIpc()
  registerGitHandlers(workspace.getWorkspaceRoot, understanding, isTrustedSender)
  registerTerminalHandlers(workspace.getWorkspaceRoot, isTrustedSender)
  registerAgentHandlers(store, workspace.getWorkspaceRoot, () => workspacePurpose, understanding, progressStorageRoot)

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
    const cloud = registerCloudHandlers(
      workspace.getWorkspaceRoot,
      workspace.setWorkspace,
      isTrustedSender,
      takePendingClassroomInvite,
      notifyCloudAuthChanged
    )
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
