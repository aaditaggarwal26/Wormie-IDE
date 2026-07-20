import { promises as fs } from 'node:fs'
import { randomUUID } from 'node:crypto'
import path from 'node:path'
import type {
  SearchOptions,
  WorkspaceFileEntry,
  WorkspaceReplacementEdit,
  WorkspaceSearchFile,
  WorkspaceSearchResponse
} from '../shared/contracts'
import { fingerprintContent } from './fileVersion'
import { applyReplacementEdits, compileSearchPattern, findTextMatches } from './workspaceSearch'

const maximumSearchResults = 5_000
const maximumSearchFiles = 50_000
const maximumFileBytes = 2_000_000

function validateGlobs(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 100 || value.some((glob) => typeof glob !== 'string' || glob.length === 0 || glob.length > 500)) {
    throw new Error('Search globs are invalid.')
  }
  return value
}

export function validateSearchOptions(value: unknown): SearchOptions {
  if (!value || typeof value !== 'object') throw new Error('The search request is invalid.')
  const candidate = value as Record<string, unknown>
  if (typeof candidate.requestId !== 'string' || candidate.requestId.length === 0 || candidate.requestId.length > 100) throw new Error('The search request is invalid.')
  if (typeof candidate.query !== 'string' || candidate.query.trim().length === 0 || candidate.query.length > 500) throw new Error('Enter a search query of 500 characters or fewer.')
  if (typeof candidate.replacement !== 'string' || candidate.replacement.length > 100_000) throw new Error('Replacement text is too large.')
  if (typeof candidate.caseSensitive !== 'boolean' || typeof candidate.wholeWord !== 'boolean' || typeof candidate.useRegex !== 'boolean') {
    throw new Error('The search options are invalid.')
  }
  if (candidate.folderPath !== null && typeof candidate.folderPath !== 'string') throw new Error('The search folder is invalid.')
  return {
    requestId: candidate.requestId,
    query: candidate.query,
    replacement: candidate.replacement,
    caseSensitive: candidate.caseSensitive,
    wholeWord: candidate.wholeWord,
    useRegex: candidate.useRegex,
    includeGlobs: validateGlobs(candidate.includeGlobs),
    excludeGlobs: validateGlobs(candidate.excludeGlobs),
    folderPath: candidate.folderPath as string | null
  }
}

function matchesGlob(relativePath: string, globs: string[]): boolean {
  return globs.some((glob) => path.matchesGlob(relativePath, glob))
}

export async function searchWorkspaceFiles(
  workspaceRoot: string,
  files: WorkspaceFileEntry[],
  options: SearchOptions,
  shouldCancel: () => boolean
): Promise<WorkspaceSearchResponse> {
  const pattern = compileSearchPattern(options)
  const resultFiles: WorkspaceSearchFile[] = []
  let totalMatches = 0
  let truncated = false

  for (const file of files.slice(0, maximumSearchFiles)) {
    if (shouldCancel()) break
    if (options.includeGlobs.length > 0 && !matchesGlob(file.relativePath, options.includeGlobs)) continue
    if (matchesGlob(file.relativePath, options.excludeGlobs)) continue
    try {
      const stats = await fs.stat(file.path)
      if (!stats.isFile() || stats.size > maximumFileBytes) continue
      const content = await fs.readFile(file.path, 'utf8')
      if (content.includes('\0')) continue
      const matches = findTextMatches(content, pattern, options.replacement)
      if (matches.length === 0) continue
      const remaining = maximumSearchResults - totalMatches
      const includedMatches = matches.slice(0, remaining)
      resultFiles.push({ path: file.path, relativePath: file.relativePath, fingerprint: fingerprintContent(content), matches: includedMatches })
      totalMatches += includedMatches.length
      if (includedMatches.length < matches.length || totalMatches >= maximumSearchResults) {
        truncated = true
        break
      }
    } catch {
      continue
    }
  }

  return { requestId: options.requestId, workspaceRoot, files: resultFiles, totalMatches, truncated }
}

export function validateReplacementEdits(value: unknown): WorkspaceReplacementEdit[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 1_000) throw new Error('Replacement edits are invalid.')
  for (const edit of value) {
    if (!edit || typeof edit !== 'object') throw new Error('Replacement edits are invalid.')
    const candidate = edit as Record<string, unknown>
    if (!Number.isInteger(candidate.start) || !Number.isInteger(candidate.end) || typeof candidate.expectedText !== 'string' || typeof candidate.replacement !== 'string') {
      throw new Error('Replacement edits are invalid.')
    }
  }
  return value as WorkspaceReplacementEdit[]
}

export async function writeReplacementFile(filePath: string, content: string, mode: number): Promise<void> {
  const temporaryPath = `${filePath}.wormie-${randomUUID()}.tmp`
  try {
    await fs.writeFile(temporaryPath, content, { encoding: 'utf8', mode })
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => undefined)
    throw error
  }
}

export { applyReplacementEdits }
