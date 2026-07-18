import type { WorkspaceFileEntry } from '@shared/contracts'

const sourceExtension = /\.(?:[cm]?[jt]sx?)$/i

export function isTypeScriptProjectFile(filePath: string): boolean {
  return sourceExtension.test(filePath)
}

export function selectTypeScriptProjectFiles(files: WorkspaceFileEntry[], maximumFiles = 1_500): WorkspaceFileEntry[] {
  if (!Number.isInteger(maximumFiles) || maximumFiles < 1 || maximumFiles > 10_000) throw new Error('The project file limit is invalid.')
  return files.filter((file) => isTypeScriptProjectFile(file.relativePath)).slice(0, maximumFiles)
}

export function languageForTypeScriptProjectFile(filePath: string): 'javascript' | 'typescript' {
  return /\.(?:jsx?|cjs|mjs)$/i.test(filePath) ? 'javascript' : 'typescript'
}
