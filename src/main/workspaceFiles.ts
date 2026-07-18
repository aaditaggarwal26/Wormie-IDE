import { promises as fs } from 'node:fs'
import path from 'node:path'

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

export type WorkspaceFileEntry = {
  path: string
  relativePath: string
  name: string
}

export type WorkspaceFileIndex = {
  files: WorkspaceFileEntry[]
  truncated: boolean
}

function portablePath(value: string): string {
  return value.split(path.sep).join('/')
}

function isExcluded(relativePath: string, globs: string[]): boolean {
  const portable = portablePath(relativePath)
  return globs.some((glob) => path.matchesGlob(portable, glob))
}

export async function collectWorkspaceFiles(
  rootPath: string,
  options: { excludeGlobs: string[]; maxFiles: number }
): Promise<WorkspaceFileIndex> {
  if (!Number.isInteger(options.maxFiles) || options.maxFiles < 1 || options.maxFiles > 100_000) {
    throw new Error('The workspace file limit is invalid.')
  }
  if (!Array.isArray(options.excludeGlobs) || options.excludeGlobs.length > 100 || options.excludeGlobs.some((glob) => typeof glob !== 'string' || glob.length > 500)) {
    throw new Error('Workspace exclusions are invalid.')
  }

  const root = await fs.realpath(rootPath)
  const files: WorkspaceFileEntry[] = []
  let truncated = false

  async function walk(directoryPath: string): Promise<void> {
    if (truncated) return
    let entries
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true })
    } catch {
      return
    }
    entries.sort((left, right) => left.name.localeCompare(right.name))

    for (const entry of entries) {
      if (entry.isSymbolicLink()) continue
      if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue
      const entryPath = path.join(directoryPath, entry.name)
      const relativePath = path.relative(root, entryPath)
      if (isExcluded(relativePath, options.excludeGlobs)) continue
      if (entry.isDirectory()) {
        await walk(entryPath)
        if (truncated) return
      } else if (entry.isFile()) {
        if (files.length >= options.maxFiles) {
          truncated = true
          return
        }
        files.push({ path: entryPath, relativePath: portablePath(relativePath), name: entry.name })
      }
    }
  }

  await walk(root)
  return { files, truncated }
}
