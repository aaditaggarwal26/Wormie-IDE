export type ReviewProgressFile = {
  pendingBlocks: number | null
  keptBlocks: number
  undoneBlocks: number
  originalContent: string
  modifiedContent: string
}

export type LineChangeShape = {
  originalStartLineNumber: number
  originalEndLineNumber: number
  modifiedStartLineNumber: number
  modifiedEndLineNumber: number
}

export type LineRangeCoordinates = {
  startLineNumber: number
  startColumn: number
  endLineNumber: number
  endColumn: number
}

export function languageForPath(filePath: string): string {
  const extension = filePath.match(/\.[^.\\/]+$/)?.[0].toLowerCase() ?? ''
  return ({
    '.css': 'css', '.go': 'go', '.html': 'html', '.java': 'java', '.js': 'javascript',
    '.json': 'json', '.jsx': 'javascript', '.md': 'markdown', '.py': 'python', '.rs': 'rust',
    '.scss': 'scss', '.sql': 'sql', '.toml': 'toml', '.ts': 'typescript', '.tsx': 'typescript',
    '.yaml': 'yaml', '.yml': 'yaml'
  } as Record<string, string>)[extension] ?? 'plaintext'
}

export function resolveProposalPath(rootPath: string, relativePath: string, platform: string): string {
  const separator = platform === 'win32' ? '\\' : '/'
  return `${rootPath.replace(/[\\/]$/, '')}${separator}${relativePath.split(/[\\/]/).join(separator)}`
}

export function lineChangeRange(change: LineChangeShape, side: 'original' | 'modified'): LineRangeCoordinates {
  const start = side === 'original' ? change.originalStartLineNumber : change.modifiedStartLineNumber
  const end = side === 'original' ? change.originalEndLineNumber : change.modifiedEndLineNumber
  const line = end === 0 ? start + 1 : start
  return {
    startLineNumber: line,
    startColumn: 1,
    endLineNumber: end === 0 ? line : end + 1,
    endColumn: 1
  }
}

export function proposalReviewProgress(files: ReviewProgressFile[]): {
  reviewedFiles: number
  totalFiles: number
  pendingBlocks: number
  keptBlocks: number
  undoneBlocks: number
  complete: boolean
  hasKeptChanges: boolean
} {
  const reviewedFiles = files.filter((file) => file.pendingBlocks === 0).length
  return {
    reviewedFiles,
    totalFiles: files.length,
    pendingBlocks: files.reduce((sum, file) => sum + (file.pendingBlocks ?? 0), 0),
    keptBlocks: files.reduce((sum, file) => sum + file.keptBlocks, 0),
    undoneBlocks: files.reduce((sum, file) => sum + file.undoneBlocks, 0),
    complete: files.length > 0 && reviewedFiles === files.length,
    hasKeptChanges: files.some((file) => file.modifiedContent !== file.originalContent || file.keptBlocks > 0)
  }
}
