import path from 'node:path'
import { app, BrowserWindow, shell } from 'electron'
import Store from 'electron-store'
import { registerAgentHandlers } from './agent'
import { registerGitHandlers } from './git'
import type { AppPreferences } from './preferences'
import { registerTerminalHandlers } from './terminal'
import { UnderstandingController } from './understanding'
import { UnderstandingRepository } from './understanding/store'
import { registerWorkspaceHandlers } from './workspace'

const store = new Store<AppPreferences>({ name: 'preferences' })
const understandingStore = new Store({ name: 'understanding-state' })
const understanding = new UnderstandingController(new UnderstandingRepository(understandingStore))

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

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

const getWorkspaceRoot = registerWorkspaceHandlers(store)
understanding.registerIpc()
registerGitHandlers(getWorkspaceRoot, understanding)
registerTerminalHandlers(getWorkspaceRoot)
registerAgentHandlers(store, getWorkspaceRoot, understanding)

void app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
