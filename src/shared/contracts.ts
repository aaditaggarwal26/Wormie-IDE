export const IPC_CHANNELS = {
  openWorkspace: 'workspace:open',
  restoreWorkspace: 'workspace:restore',
  refreshWorkspace: 'workspace:refresh',
  readFile: 'workspace:read-file',
  writeFile: 'workspace:write-file',
  createEntry: 'workspace:create-entry',
  renameEntry: 'workspace:rename-entry',
  deleteEntry: 'workspace:delete-entry',
  searchWorkspace: 'workspace:search',
  gitStatus: 'git:status',
  terminalStart: 'terminal:start',
  terminalWrite: 'terminal:write',
  terminalStop: 'terminal:stop',
  terminalData: 'terminal:data',
  terminalExit: 'terminal:exit'
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

export type WorkspaceMutation = {
  workspace: WorkspaceSnapshot
  path: string
  previousPath?: string
}

export type SearchResult = {
  path: string
  relativePath: string
  line: number
  column: number
  preview: string
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

export type GitStatusSnapshot = {
  workspaceRoot: string
  repositories: GitRepositorySnapshot[]
}

export type TerminalExit = {
  code: number | null
}

export type DesktopApi = {
  platform: string
  openWorkspace: () => Promise<WorkspaceSnapshot | null>
  restoreWorkspace: () => Promise<WorkspaceSnapshot | null>
  refreshWorkspace: () => Promise<WorkspaceSnapshot>
  readFile: (filePath: string) => Promise<OpenFile>
  writeFile: (filePath: string, content: string) => Promise<void>
  createEntry: (parentPath: string, name: string, type: 'file' | 'directory') => Promise<WorkspaceMutation>
  renameEntry: (entryPath: string, name: string) => Promise<WorkspaceMutation>
  deleteEntry: (entryPath: string) => Promise<WorkspaceMutation | null>
  searchWorkspace: (query: string) => Promise<SearchResult[]>
  getGitStatus: () => Promise<GitStatusSnapshot>
  startTerminal: () => Promise<void>
  writeTerminal: (data: string) => void
  stopTerminal: () => void
  onTerminalData: (callback: (data: string) => void) => () => void
  onTerminalExit: (callback: (event: TerminalExit) => void) => () => void
}
