import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import type Store from 'electron-store'
import {
  IPC_CHANNELS,
  type FileTreeNode,
  type OpenFile,
  type WorkspaceSnapshot
} from '../shared/contracts'
import { isPathInside } from './pathSafety'

type Preferences = {
  recentWorkspace?: string
  windowBounds?: { width: number; height: number }
}

const ignoredDirectories = new Set([
  '.git',
  '.idea',
  '.next',
  '.turbo',
  '.vscode',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
])

const maxFileBytes = 2 * 1024 * 1024
const maxTreeEntries = 5000

function languageFor(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase()
  const languages: Record<string, string> = {
    '.css': 'css',
    '.go': 'go',
    '.html': 'html',
    '.java': 'java',
    '.js': 'javascript',
    '.json': 'json',
    '.jsx': 'javascript',
    '.md': 'markdown',
    '.py': 'python',
    '.rs': 'rust',
    '.scss': 'scss',
    '.sql': 'sql',
    '.toml': 'toml',
    '.ts': 'typescript',
    '.tsx': 'typescript',
    '.yaml': 'yaml',
    '.yml': 'yaml'
  }

  return languages[extension] ?? 'plaintext'
}

async function readTree(directoryPath: string, count: { value: number }): Promise<FileTreeNode[]> {
  if (count.value >= maxTreeEntries) return []

  const directoryEntries = await fs.readdir(directoryPath, { withFileTypes: true })
  const visibleEntries = directoryEntries
    .filter((entry) => !entry.isSymbolicLink())
    .filter((entry) => !entry.isDirectory() || !ignoredDirectories.has(entry.name))
    .sort((left, right) => {
      if (left.isDirectory() !== right.isDirectory()) return left.isDirectory() ? -1 : 1
      return left.name.localeCompare(right.name)
    })

  const nodes: FileTreeNode[] = []
  for (const entry of visibleEntries) {
    if (count.value >= maxTreeEntries) break
    count.value += 1

    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      nodes.push({
        name: entry.name,
        path: entryPath,
        type: 'directory',
        children: await readTree(entryPath, count)
      })
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: entryPath, type: 'file' })
    }
  }

  return nodes
}

async function createSnapshot(rootPath: string): Promise<WorkspaceSnapshot> {
  const count = { value: 0 }
  const entries = await readTree(rootPath, count)

  return {
    name: path.basename(rootPath),
    rootPath,
    entries,
    truncated: count.value >= maxTreeEntries
  }
}

export function registerWorkspaceHandlers(store: Store<Preferences>): void {
  let activeWorkspaceRoot: string | null = null

  async function setWorkspace(rootPath: string): Promise<WorkspaceSnapshot> {
    const resolvedRoot = await fs.realpath(rootPath)
    const stats = await fs.stat(resolvedRoot)
    if (!stats.isDirectory()) throw new Error('The selected workspace is not a directory.')

    activeWorkspaceRoot = resolvedRoot
    store.set('recentWorkspace', resolvedRoot)
    return createSnapshot(resolvedRoot)
  }

  async function resolveWorkspaceFile(filePath: string): Promise<string> {
    if (!activeWorkspaceRoot) throw new Error('Open a workspace before accessing files.')

    const resolvedPath = await fs.realpath(filePath)
    if (!isPathInside(activeWorkspaceRoot, resolvedPath)) {
      throw new Error('The requested file is outside the active workspace.')
    }

    return resolvedPath
  }

  ipcMain.handle(IPC_CHANNELS.openWorkspace, async () => {
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return setWorkspace(result.filePaths[0])
  })

  ipcMain.handle(IPC_CHANNELS.restoreWorkspace, async () => {
    const recentWorkspace = store.get('recentWorkspace')
    if (!recentWorkspace) return null

    try {
      return await setWorkspace(recentWorkspace)
    } catch {
      store.delete('recentWorkspace')
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.readFile, async (_event, filePath: string): Promise<OpenFile> => {
    const resolvedPath = await resolveWorkspaceFile(filePath)
    const stats = await fs.stat(resolvedPath)
    if (!stats.isFile()) throw new Error('The requested path is not a file.')
    if (stats.size > maxFileBytes) throw new Error('Files larger than 2 MB are not opened in the editor.')

    const content = await fs.readFile(resolvedPath, 'utf8')
    if (content.includes('\0')) throw new Error('Binary files are not supported in the text editor.')

    return {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      content,
      language: languageFor(resolvedPath)
    }
  })

  ipcMain.handle(IPC_CHANNELS.writeFile, async (_event, filePath: string, content: string) => {
    const resolvedPath = await resolveWorkspaceFile(filePath)
    const stats = await fs.stat(resolvedPath)
    if (!stats.isFile()) throw new Error('The requested path is not a file.')
    await fs.writeFile(resolvedPath, content, 'utf8')
  })
}
