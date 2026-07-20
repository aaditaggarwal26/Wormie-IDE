import type { WorkspaceReplacementEdit } from '@shared/contracts'

export type WorkerRenameLocation = {
  fileName: string
  textSpan: { start: number; length: number }
  prefixText?: string
  suffixText?: string
}

export type RenameSourceFile = {
  path: string
  content: string
  fingerprint: string
}

export type RenamePreviewOccurrence = {
  line: number
  before: string
  after: string
}

export type RenamePreviewFile = {
  uri: string
  path: string
  fingerprint: string
  edits: WorkspaceReplacementEdit[]
  occurrences: RenamePreviewOccurrence[]
}

function occurrence(content: string, start: number, end: number, replacement: string): RenamePreviewOccurrence {
  const lineStart = content.lastIndexOf('\n', Math.max(0, start - 1)) + 1
  const lineEndIndex = content.indexOf('\n', end)
  const lineEnd = lineEndIndex === -1 ? content.length : lineEndIndex
  const before = content.slice(lineStart, lineEnd).replace(/\r$/, '')
  let line = 1
  for (let index = 0; index < lineStart; index += 1) if (content.charCodeAt(index) === 10) line += 1
  return { line, before, after: `${content.slice(lineStart, start)}${replacement}${content.slice(end, lineEnd)}`.replace(/\r$/, '') }
}

export function buildRenamePreview(
  newName: string,
  locations: WorkerRenameLocation[],
  sourceByUri: Map<string, RenameSourceFile>
): RenamePreviewFile[] {
  if (!newName.trim()) throw new Error('Enter a new symbol name.')
  const grouped = new Map<string, RenamePreviewFile>()
  for (const location of locations) {
    const source = sourceByUri.get(location.fileName)
    if (!source) throw new Error('A rename file could not be read.')
    const start = location.textSpan.start
    const end = start + location.textSpan.length
    if (!Number.isInteger(start) || !Number.isInteger(location.textSpan.length) || start < 0 || end > source.content.length || end <= start) {
      throw new Error('The language service returned an invalid location.')
    }
    const expectedText = source.content.slice(start, end)
    const replacement = `${location.prefixText ?? ''}${newName}${location.suffixText ?? ''}`
    const file = grouped.get(location.fileName) ?? {
      uri: location.fileName,
      path: source.path,
      fingerprint: source.fingerprint,
      edits: [],
      occurrences: []
    }
    file.edits.push({ start, end, expectedText, replacement })
    file.occurrences.push(occurrence(source.content, start, end, replacement))
    grouped.set(location.fileName, file)
  }
  return [...grouped.values()].map((file) => ({
    ...file,
    edits: file.edits.sort((left, right) => left.start - right.start),
    occurrences: file.occurrences.sort((left, right) => left.line - right.line)
  }))
}
