import { contextBridge, ipcRenderer } from 'electron'
import { IPC_CHANNELS, type DesktopApi } from '../shared/contracts'

const desktopApi: DesktopApi = {
  platform: process.platform,
  openWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.openWorkspace),
  restoreWorkspace: () => ipcRenderer.invoke(IPC_CHANNELS.restoreWorkspace),
  readFile: (filePath) => ipcRenderer.invoke(IPC_CHANNELS.readFile, filePath),
  writeFile: (filePath, content) => ipcRenderer.invoke(IPC_CHANNELS.writeFile, filePath, content)
}

contextBridge.exposeInMainWorld('desktop', desktopApi)

