import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain } from 'electron'
import type Store from 'electron-store'
import {
  IPC_CHANNELS,
  type FileTreeNode,
  type OpenFile,
  type SearchResult,
  type WorkspaceMutation,
  type WorkspaceSnapshot
} from '../shared/contracts'
import { isPathInside, validateEntryName } from './pathSafety'

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
const maxSearchResults = 100

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

async function searchDirectory(
  rootPath: string,
  directoryPath: string,
  query: string,
  results: SearchResult[]
): Promise<void> {
  if (results.length >= maxSearchResults) return

  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  for (const entry of entries) {
    if (results.length >= maxSearchResults) return
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue

    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      await searchDirectory(rootPath, entryPath, query, results)
      continue
    }
    if (!entry.isFile()) continue

    const relativePath = path.relative(rootPath, entryPath)
    if (entry.name.toLowerCase().includes(query)) {
      results.push({ path: entryPath, relativePath, line: 1, column: 1, preview: relativePath })
      if (results.length >= maxSearchResults) return
    }

    try {
      const stats = await fs.stat(entryPath)
      if (stats.size > maxFileBytes) continue
      const content = await fs.readFile(entryPath, 'utf8')
      if (content.includes('\0')) continue

      const lines = content.split(/\r?\n/)
      let matchesInFile = 0
      for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
        const column = lines[lineIndex].toLowerCase().indexOf(query)
        if (column === -1) continue
        results.push({
          path: entryPath,
          relativePath,
          line: lineIndex + 1,
          column: column + 1,
          preview: lines[lineIndex].trim().slice(0, 180)
        })
        matchesInFile += 1
        if (matchesInFile === 3 || results.length >= maxSearchResults) break
      }
    } catch {
      continue
    }
  }
}

export function registerWorkspaceHandlers(store: Store<Preferences>): () => string | null {
  let activeWorkspaceRoot: string | null = null

  function requireWorkspaceRoot(): string {
    if (!activeWorkspaceRoot) throw new Error('Open a workspace first.')
    return activeWorkspaceRoot
  }

  async function setWorkspace(rootPath: string): Promise<WorkspaceSnapshot> {
    const resolvedRoot = await fs.realpath(rootPath)
    const stats = await fs.stat(resolvedRoot)
    if (!stats.isDirectory()) throw new Error('The selected workspace is not a directory.')

    activeWorkspaceRoot = resolvedRoot
    store.set('recentWorkspace', resolvedRoot)
    return createSnapshot(resolvedRoot)
  }

  async function resolveWorkspaceFile(filePath: string): Promise<string> {
    const workspaceRoot = requireWorkspaceRoot()

    const resolvedPath = await fs.realpath(filePath)
    if (!isPathInside(workspaceRoot, resolvedPath)) {
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

  ipcMain.handle(IPC_CHANNELS.refreshWorkspace, () => createSnapshot(requireWorkspaceRoot()))

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

  ipcMain.handle(
    IPC_CHANNELS.createEntry,
    async (_event, parentPath: string, name: string, type: 'file' | 'directory'): Promise<WorkspaceMutation> => {
      const workspaceRoot = requireWorkspaceRoot()
      if (type !== 'file' && type !== 'directory') throw new Error('Unsupported workspace entry type.')
      const resolvedParent = await fs.realpath(parentPath)
      const parentStats = await fs.stat(resolvedParent)
      if (!parentStats.isDirectory() || !isPathInside(workspaceRoot, resolvedParent)) {
        throw new Error('New entries must be created inside a workspace folder.')
      }

      const entryPath = path.resolve(resolvedParent, validateEntryName(name))
      if (!isPathInside(workspaceRoot, entryPath)) throw new Error('The requested path is outside the workspace.')

      if (type === 'directory') await fs.mkdir(entryPath)
      else await fs.writeFile(entryPath, '', { encoding: 'utf8', flag: 'wx' })

      return { workspace: await createSnapshot(workspaceRoot), path: entryPath }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.renameEntry,
    async (_event, entryPath: string, name: string): Promise<WorkspaceMutation> => {
      const workspaceRoot = requireWorkspaceRoot()
      const resolvedPath = await resolveWorkspaceFile(entryPath)
      if (resolvedPath === workspaceRoot) throw new Error('The workspace root cannot be renamed here.')

      const nextPath = path.join(path.dirname(resolvedPath), validateEntryName(name))
      if (!isPathInside(workspaceRoot, nextPath)) throw new Error('The requested path is outside the workspace.')
      if (nextPath !== resolvedPath) {
        try {
          await fs.access(nextPath)
          throw new Error('A file or folder with that name already exists.')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      await fs.rename(resolvedPath, nextPath)

      return {
        workspace: await createSnapshot(workspaceRoot),
        path: nextPath,
        previousPath: resolvedPath
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.deleteEntry,
    async (_event, entryPath: string): Promise<WorkspaceMutation | null> => {
      const workspaceRoot = requireWorkspaceRoot()
      const resolvedPath = await resolveWorkspaceFile(entryPath)
      if (resolvedPath === workspaceRoot) throw new Error('The workspace root cannot be deleted.')

      const confirmation = await dialog.showMessageBox({
        type: 'warning',
        title: 'Delete from workspace',
        message: `Delete "${path.basename(resolvedPath)}"?`,
        detail: 'This action cannot be undone.',
        buttons: ['Delete', 'Cancel'],
        defaultId: 1,
        cancelId: 1,
        noLink: true
      })
      if (confirmation.response !== 0) return null

      const stats = await fs.stat(resolvedPath)
      if (stats.isDirectory()) await fs.rm(resolvedPath, { recursive: true })
      else await fs.unlink(resolvedPath)

      return { workspace: await createSnapshot(workspaceRoot), path: resolvedPath }
    }
  )

  ipcMain.handle(IPC_CHANNELS.searchWorkspace, async (_event, rawQuery: string): Promise<SearchResult[]> => {
    const workspaceRoot = requireWorkspaceRoot()
    if (typeof rawQuery !== 'string') throw new Error('Enter a valid search query.')
    const query = rawQuery.trim().toLowerCase()
    if (!query) return []
    if (query.length > 200) throw new Error('Search queries are limited to 200 characters.')

    const results: SearchResult[] = []
    await searchDirectory(workspaceRoot, workspaceRoot, query, results)
    return results
  })

  return () => activeWorkspaceRoot
}
