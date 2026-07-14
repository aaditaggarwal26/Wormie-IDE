import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { IPC_CHANNELS, type DesktopApi } from '../shared/contracts'

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
  }
}

contextBridge.exposeInMainWorld('desktop', desktopApi)
