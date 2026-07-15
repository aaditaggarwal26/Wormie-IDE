import { promises as fs } from 'node:fs'
import path from 'node:path'

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

const maxDepth = 5
const maxDirectories = 2000
const maxRepositories = 20

export async function findGitRepositories(workspaceRoot: string): Promise<string[]> {
  const repositories: string[] = []
  let visitedDirectories = 0

  const visit = async (directoryPath: string, depth: number): Promise<void> => {
    if (
      depth > maxDepth ||
      visitedDirectories >= maxDirectories ||
      repositories.length >= maxRepositories
    ) return

    visitedDirectories += 1
    let entries
    try {
      entries = await fs.readdir(directoryPath, { withFileTypes: true })
    } catch {
      return
    }

    if (entries.some((entry) => entry.name === '.git')) {
      repositories.push(directoryPath)
      return
    }

    for (const entry of entries) {
      if (repositories.length >= maxRepositories || visitedDirectories >= maxDirectories) return
      if (!entry.isDirectory() || entry.isSymbolicLink() || ignoredDirectories.has(entry.name)) continue
      await visit(path.join(directoryPath, entry.name), depth + 1)
    }
  }

  await visit(workspaceRoot, 0)
  return repositories
}
