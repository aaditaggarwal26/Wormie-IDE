import { promises as fs, unwatchFile, watchFile, type Stats } from 'node:fs'
import path from 'node:path'
import { clipboard, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type Store from 'electron-store'
import {
  IPC_CHANNELS,
  type FileTreeNode,
  type OpenFile,
  type SearchOptions,
  type WorkspaceReplacementRequest,
  type WorkspaceReplacementResponse,
  type WorkspaceSearchResponse,
  type WorkspaceFileChange,
  type WorkspaceFileList,
  type WriteFileRequest,
  type WrittenFile,
  type WorkspaceMutation,
  type WorkspaceSnapshot,
  type WorkspacePurpose
} from '../shared/contracts'
import { isPathInside, validateEntryName } from './pathSafety'
import type { AppPreferences } from './preferences'
import { collectWorkspaceFiles } from './workspaceFiles'
import { assertExpectedFingerprint, fingerprintContent } from './fileVersion'
import { validateWatchFilePaths } from './fileWatchPolicy'
import { applyReplacementEdits, searchWorkspaceFiles, validateReplacementEdits, validateSearchOptions, writeReplacementFile } from './workspaceSearchService'
import { ensureWorkspaceRequestCurrent } from './workspaceTransition'

const ignoredDirectories = new Set([
  '.git',
  '.idea',
  '.next',
  '.turbo',
  '.vscode',
  '.wormie',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'out',
  'release'
])

const maxFileBytes = 2 * 1024 * 1024
const maxTreeEntries = 5000

function isProtectedMetadataPath(workspaceRoot: string, targetPath: string): boolean {
  const relative = path.relative(workspaceRoot, targetPath)
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) return false
  const firstSegment = relative.split(path.sep)[0].toLowerCase()
  return firstSegment === '.git' || firstSegment === '.wormie'
}

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

export async function createWorkspaceSnapshot(rootPath: string): Promise<WorkspaceSnapshot> {
  const count = { value: 0 }
  const entries = await readTree(rootPath, count)

  return {
    name: path.basename(rootPath),
    rootPath,
    entries,
    truncated: count.value >= maxTreeEntries
  }
}

export function registerWorkspaceHandlers(
  store: Store<AppPreferences>,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  getWorkspacePurpose: () => WorkspacePurpose
): {
  getWorkspaceRoot: () => string | null
  setWorkspace: (rootPath: string, isCurrent?: () => boolean) => Promise<WorkspaceSnapshot>
} {
  let activeWorkspaceRoot: string | null = null
  let searchGeneration = 0
  let workspaceTransition: Promise<void> = Promise.resolve()
  let fileIndex: { rootPath: string; promise: ReturnType<typeof collectWorkspaceFiles> } | null = null
  const watchedFiles = new Map<string, (current: Stats, previous: Stats) => void>()

  function assertTrusted(event: IpcMainInvokeEvent): void {
    if (!isTrustedSender(event)) throw new Error('Workspace access was denied for this window.')
  }

  function invalidateFileIndex(): void {
    fileIndex = null
  }

  function clearFileWatchers(): void {
    for (const [filePath, listener] of watchedFiles) unwatchFile(filePath, listener)
    watchedFiles.clear()
  }

  function getFileIndex(rootPath: string) {
    if (!fileIndex || fileIndex.rootPath !== rootPath) {
      fileIndex = {
        rootPath,
        promise: collectWorkspaceFiles(rootPath, { excludeGlobs: ['**/*.map', '**/*.min.js'], maxFiles: 50_000 })
      }
    }
    return fileIndex.promise
  }

  function requireWorkspaceRoot(): string {
    if (!activeWorkspaceRoot) throw new Error('Open a workspace first.')
    return activeWorkspaceRoot
  }

  function setWorkspace(rootPath: string, isCurrent?: () => boolean): Promise<WorkspaceSnapshot> {
    const operation = workspaceTransition.then(async () => {
      ensureWorkspaceRequestCurrent(isCurrent)
      const resolvedRoot = await fs.realpath(rootPath)
      const stats = await fs.stat(resolvedRoot)
      if (!stats.isDirectory()) throw new Error('The selected workspace is not a directory.')
      const snapshot = await createWorkspaceSnapshot(resolvedRoot)
      ensureWorkspaceRequestCurrent(isCurrent)
      activeWorkspaceRoot = resolvedRoot
      searchGeneration += 1
      clearFileWatchers()
      invalidateFileIndex()
      void getFileIndex(resolvedRoot).catch(() => invalidateFileIndex())
      store.set('recentWorkspace', resolvedRoot)
      return snapshot
    })
    workspaceTransition = operation.then(() => undefined, () => undefined)
    return operation
  }

  function closeWorkspace(): Promise<void> {
    const operation = workspaceTransition.then(() => {
      activeWorkspaceRoot = null
      searchGeneration += 1
      clearFileWatchers()
      invalidateFileIndex()
    })
    workspaceTransition = operation.then(() => undefined, () => undefined)
    return operation
  }

  async function resolveWorkspaceFile(filePath: string): Promise<string> {
    const workspaceRoot = requireWorkspaceRoot()

    const resolvedPath = await fs.realpath(filePath)
    if (!isPathInside(workspaceRoot, resolvedPath)) {
      throw new Error('The requested file is outside the active workspace.')
    }

    return resolvedPath
  }

  async function readWorkspaceFile(filePath: string): Promise<OpenFile> {
    const resolvedPath = await resolveWorkspaceFile(filePath)
    if (isProtectedMetadataPath(requireWorkspaceRoot(), resolvedPath)) throw new Error('Workspace metadata is managed by Wormie.')
    const stats = await fs.stat(resolvedPath)
    if (!stats.isFile()) throw new Error('The requested path is not a file.')
    if (stats.size > maxFileBytes) throw new Error('Files larger than 2 MB are not opened in the editor.')

    const content = await fs.readFile(resolvedPath, 'utf8')
    if (content.includes('\0')) throw new Error('Binary files are not supported in the text editor.')
    return {
      path: resolvedPath,
      name: path.basename(resolvedPath),
      content,
      language: languageFor(resolvedPath),
      fingerprint: fingerprintContent(content)
    }
  }

  ipcMain.handle(IPC_CHANNELS.openWorkspace, async (event, expectedPurpose?: unknown) => {
    assertTrusted(event)
    if (expectedPurpose !== undefined && expectedPurpose !== 'sandbox' && expectedPurpose !== 'assignment') {
      throw new Error('Invalid workspace purpose.')
    }
    const result = await dialog.showOpenDialog({ properties: ['openDirectory'] })
    if (result.canceled || result.filePaths.length === 0) return null
    return setWorkspace(
      result.filePaths[0],
      typeof expectedPurpose === 'string' ? () => getWorkspacePurpose() === expectedPurpose : undefined
    )
  })

  ipcMain.handle(IPC_CHANNELS.closeWorkspace, async (event) => {
    assertTrusted(event)
    await closeWorkspace()
  })

  ipcMain.handle(IPC_CHANNELS.restoreWorkspace, async (event) => {
    assertTrusted(event)
    const recentWorkspace = store.get('recentWorkspace')
    if (!recentWorkspace) return null

    try {
      return await setWorkspace(recentWorkspace)
    } catch {
      store.delete('recentWorkspace')
      return null
    }
  })

  ipcMain.handle(IPC_CHANNELS.refreshWorkspace, (event) => {
    assertTrusted(event)
    invalidateFileIndex()
    return createWorkspaceSnapshot(requireWorkspaceRoot())
  })

  ipcMain.handle(IPC_CHANNELS.readFile, async (event, filePath: string): Promise<OpenFile> => {
    assertTrusted(event)
    return readWorkspaceFile(filePath)
  })

  ipcMain.handle(IPC_CHANNELS.writeFile, async (event, request: WriteFileRequest): Promise<WrittenFile> => {
    assertTrusted(event)
    if (!request || typeof request.filePath !== 'string' || typeof request.expectedFingerprint !== 'string') throw new Error('The save request is invalid.')
    const { filePath, content, expectedFingerprint } = request
    if (typeof content !== 'string' || Buffer.byteLength(content, 'utf8') > maxFileBytes) throw new Error('The file content is invalid or too large.')
    const resolvedPath = await resolveWorkspaceFile(filePath)
    if (isProtectedMetadataPath(requireWorkspaceRoot(), resolvedPath)) throw new Error('Workspace metadata is managed by Wormie.')
    const stats = await fs.stat(resolvedPath)
    if (!stats.isFile()) throw new Error('The requested path is not a file.')
    const currentContent = await fs.readFile(resolvedPath, 'utf8')
    assertExpectedFingerprint(expectedFingerprint, fingerprintContent(currentContent))
    await fs.writeFile(resolvedPath, content, 'utf8')
    return { path: resolvedPath, fingerprint: fingerprintContent(content) }
  })

  ipcMain.handle(
    IPC_CHANNELS.createEntry,
    async (event, parentPath: string, name: string, type: 'file' | 'directory'): Promise<WorkspaceMutation> => {
      assertTrusted(event)
      const workspaceRoot = requireWorkspaceRoot()
      if (type !== 'file' && type !== 'directory') throw new Error('Unsupported workspace entry type.')
      const resolvedParent = await fs.realpath(parentPath)
      const parentStats = await fs.stat(resolvedParent)
      if (!parentStats.isDirectory() || !isPathInside(workspaceRoot, resolvedParent)) {
        throw new Error('New entries must be created inside a workspace folder.')
      }
      if (isProtectedMetadataPath(workspaceRoot, resolvedParent)) throw new Error('Workspace metadata is managed by Wormie.')

      const entryPath = path.resolve(resolvedParent, validateEntryName(name))
      if (!isPathInside(workspaceRoot, entryPath)) throw new Error('The requested path is outside the workspace.')
      if (isProtectedMetadataPath(workspaceRoot, entryPath)) throw new Error('Workspace metadata is managed by Wormie.')

      if (type === 'directory') await fs.mkdir(entryPath)
      else await fs.writeFile(entryPath, '', { encoding: 'utf8', flag: 'wx' })
      invalidateFileIndex()

      return { workspace: await createWorkspaceSnapshot(workspaceRoot), path: entryPath }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.renameEntry,
    async (event, entryPath: string, name: string): Promise<WorkspaceMutation> => {
      assertTrusted(event)
      const workspaceRoot = requireWorkspaceRoot()
      const resolvedPath = await resolveWorkspaceFile(entryPath)
      if (resolvedPath === workspaceRoot) throw new Error('The workspace root cannot be renamed here.')
      if (isProtectedMetadataPath(workspaceRoot, resolvedPath)) throw new Error('Workspace metadata is managed by Wormie.')

      const nextPath = path.join(path.dirname(resolvedPath), validateEntryName(name))
      if (!isPathInside(workspaceRoot, nextPath)) throw new Error('The requested path is outside the workspace.')
      if (isProtectedMetadataPath(workspaceRoot, nextPath)) throw new Error('Workspace metadata is managed by Wormie.')
      if (nextPath !== resolvedPath) {
        try {
          await fs.access(nextPath)
          throw new Error('A file or folder with that name already exists.')
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      await fs.rename(resolvedPath, nextPath)
      invalidateFileIndex()

      return {
        workspace: await createWorkspaceSnapshot(workspaceRoot),
        path: nextPath,
        previousPath: resolvedPath
      }
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.deleteEntry,
    async (event, entryPath: string): Promise<WorkspaceMutation | null> => {
      assertTrusted(event)
      const workspaceRoot = requireWorkspaceRoot()
      const resolvedPath = await resolveWorkspaceFile(entryPath)
      if (resolvedPath === workspaceRoot) throw new Error('The workspace root cannot be deleted.')
      if (isProtectedMetadataPath(workspaceRoot, resolvedPath)) throw new Error('Workspace metadata is managed by Wormie.')

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
      invalidateFileIndex()

      return { workspace: await createWorkspaceSnapshot(workspaceRoot), path: resolvedPath }
    }
  )

  ipcMain.handle(IPC_CHANNELS.searchWorkspace, async (event, rawOptions: SearchOptions): Promise<WorkspaceSearchResponse> => {
    assertTrusted(event)
    const workspaceRoot = requireWorkspaceRoot()
    const options = validateSearchOptions(rawOptions)
    let files = (await getFileIndex(workspaceRoot)).files
    if (options.folderPath) {
      const folderPath = await resolveWorkspaceFile(options.folderPath)
      const stats = await fs.stat(folderPath)
      if (!stats.isDirectory()) throw new Error('The search scope must be a folder.')
      files = files.filter((file) => isPathInside(folderPath, file.path))
    }
    const generation = ++searchGeneration
    return searchWorkspaceFiles(workspaceRoot, files, options, () => generation !== searchGeneration || activeWorkspaceRoot !== workspaceRoot)
  })

  ipcMain.handle(IPC_CHANNELS.replaceWorkspace, async (event, request: WorkspaceReplacementRequest): Promise<WorkspaceReplacementResponse> => {
    assertTrusted(event)
    const workspaceRoot = requireWorkspaceRoot()
    if (!request || request.workspaceRoot !== workspaceRoot || !Array.isArray(request.files) || request.files.length === 0 || request.files.length > 200) {
      throw new Error('The replacement request is invalid for this workspace.')
    }
    const outcomes: WorkspaceReplacementResponse['outcomes'] = []
    for (const file of request.files) {
      try {
        if (!file || typeof file.filePath !== 'string' || typeof file.expectedFingerprint !== 'string') throw new Error('The replacement file is invalid.')
        const edits = validateReplacementEdits(file.edits)
        const resolvedPath = await resolveWorkspaceFile(file.filePath)
        if (isProtectedMetadataPath(workspaceRoot, resolvedPath)) throw new Error('Workspace metadata is managed by Wormie.')
        const stats = await fs.stat(resolvedPath)
        if (!stats.isFile() || stats.size > maxFileBytes) throw new Error('The file cannot be replaced as text.')
        const content = await fs.readFile(resolvedPath, 'utf8')
        if (content.includes('\0')) throw new Error('Binary files cannot be replaced.')
        assertExpectedFingerprint(file.expectedFingerprint, fingerprintContent(content))
        const nextContent = applyReplacementEdits(content, edits)
        await writeReplacementFile(resolvedPath, nextContent, stats.mode)
        outcomes.push({ filePath: resolvedPath, status: 'applied', replacements: edits.length, fingerprint: fingerprintContent(nextContent) })
      } catch (error) {
        outcomes.push({ filePath: typeof file?.filePath === 'string' ? file.filePath : '', status: 'failed', replacements: 0, message: error instanceof Error ? error.message : 'Replacement failed.' })
      }
    }
    invalidateFileIndex()
    return { workspaceRoot, outcomes }
  })

  ipcMain.handle(IPC_CHANNELS.listWorkspaceFiles, async (event): Promise<WorkspaceFileList> => {
    assertTrusted(event)
    const workspaceRoot = requireWorkspaceRoot()
    const result = await getFileIndex(workspaceRoot)
    if (activeWorkspaceRoot !== workspaceRoot) throw new Error('The active workspace changed while files were being indexed.')
    return { workspaceRoot, ...result }
  })

  ipcMain.handle(IPC_CHANNELS.copyWorkspacePath, async (event, filePath: string, kind: 'absolute' | 'relative'): Promise<void> => {
    assertTrusted(event)
    if (kind !== 'absolute' && kind !== 'relative') throw new Error('Choose a valid path format.')
    const workspaceRoot = requireWorkspaceRoot()
    const resolvedPath = await resolveWorkspaceFile(filePath)
    clipboard.writeText(kind === 'absolute' ? resolvedPath : path.relative(workspaceRoot, resolvedPath))
  })

  ipcMain.handle(IPC_CHANNELS.watchWorkspaceFiles, async (event, filePaths: string[]): Promise<void> => {
    assertTrusted(event)
    const workspaceRoot = requireWorkspaceRoot()
    const resolvedPaths = await Promise.all(validateWatchFilePaths(filePaths).map((filePath) => resolveWorkspaceFile(filePath)))
    clearFileWatchers()

    for (const filePath of resolvedPaths) {
      const listener = (current: Stats, previous: Stats) => {
        if (activeWorkspaceRoot !== workspaceRoot || event.sender.isDestroyed()) return
        if (current.mtimeMs === previous.mtimeMs && current.size === previous.size && current.nlink === previous.nlink) return
        void (async () => {
          let change: WorkspaceFileChange
          if (current.nlink === 0) {
            change = { workspaceRoot, filePath, kind: 'deleted', fingerprint: null }
          } else {
            const content = await fs.readFile(filePath, 'utf8')
            change = { workspaceRoot, filePath, kind: 'changed', fingerprint: fingerprintContent(content) }
          }
          if (activeWorkspaceRoot === workspaceRoot && !event.sender.isDestroyed()) {
            event.sender.send(IPC_CHANNELS.workspaceFileChanged, change)
          }
        })().catch(() => undefined)
      }
      watchedFiles.set(filePath, listener)
      watchFile(filePath, { interval: 750, persistent: false }, listener)
    }
  })

  return { getWorkspaceRoot: () => activeWorkspaceRoot, setWorkspace }
}
