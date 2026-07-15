import path from 'node:path'
import { app, BrowserWindow, shell, type IpcMainInvokeEvent } from 'electron'
import Store from 'electron-store'
import { registerAgentHandlers } from './agent'
import { registerAssignmentHandlers } from './assignments'
import { registerGitHandlers } from './git'
import { createRendererUrlValidator } from './ipcTrust'
import type { AppPreferences } from './preferences'
import { registerTerminalHandlers } from './terminal'
import { registerWorkspaceHandlers } from './workspace'

const store = new Store<AppPreferences>({ name: 'preferences' })
const trustedWebContents = new Set<number>()
const rendererFilePath = path.join(__dirname, '../renderer/index.html')
const isTrustedRendererUrl = createRendererUrlValidator(process.env.ELECTRON_RENDERER_URL, rendererFilePath)

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

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(rendererFilePath)
  }
}

if (!app.requestSingleInstanceLock()) {
  app.quit()
} else {
  const workspace = registerWorkspaceHandlers(store)
  registerAssignmentHandlers(
    store,
    path.join(app.getPath('userData'), 'assignment-progress'),
    workspace.getWorkspaceRoot,
    workspace.setWorkspace,
    (event: IpcMainInvokeEvent) =>
      trustedWebContents.has(event.sender.id) &&
      event.senderFrame === event.sender.mainFrame &&
      isTrustedRendererUrl(event.senderFrame.url)
  )
  registerGitHandlers(workspace.getWorkspaceRoot)
  registerTerminalHandlers(workspace.getWorkspaceRoot)
  registerAgentHandlers(store, workspace.getWorkspaceRoot, path.join(app.getPath('userData'), 'assignment-progress'))

  app.on('second-instance', () => {
    const mainWindow = BrowserWindow.getAllWindows()[0]
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  void app.whenReady().then(() => {
    createWindow()
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
