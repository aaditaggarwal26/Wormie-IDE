export const IPC_CHANNELS = {
  openWorkspace: 'workspace:open',
  restoreWorkspace: 'workspace:restore',
  readFile: 'workspace:read-file',
  writeFile: 'workspace:write-file'
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

export type DesktopApi = {
  platform: string
  openWorkspace: () => Promise<WorkspaceSnapshot | null>
  restoreWorkspace: () => Promise<WorkspaceSnapshot | null>
  readFile: (filePath: string) => Promise<OpenFile>
  writeFile: (filePath: string, content: string) => Promise<void>
}

