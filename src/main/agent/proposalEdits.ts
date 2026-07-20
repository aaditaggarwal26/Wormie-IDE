export type ProposalTextEdit = {
  oldText: string
  newText: string
}

export type ResolvedProposalTextEdit = ProposalTextEdit & {
  start: number
  end: number
}

export type MaterializedProposalUpdate = {
  content: string
  edits: ResolvedProposalTextEdit[]
  additions: number
  deletions: number
  patch: string
}

const maxFileCharacters = 500_000
const maxEditCharacters = 100_000
const maxEdits = 100
const maxReviewStates = 10_000

function uniqueIndex(content: string, value: string): number {
  if (!value) return content.length === 0 ? 0 : -1
  const start = content.indexOf(value)
  return start >= 0 && content.indexOf(value, start + 1) < 0 ? start : -1
}

function minimizeEdit(originalContent: string, edit: ProposalTextEdit): ResolvedProposalTextEdit {
  const originalStart = uniqueIndex(originalContent, edit.oldText)
  if (originalStart < 0) throw new Error('not uniquely anchored')

  let prefix = 0
  while (prefix < edit.oldText.length && prefix < edit.newText.length && edit.oldText[prefix] === edit.newText[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < edit.oldText.length - prefix &&
    suffix < edit.newText.length - prefix &&
    edit.oldText[edit.oldText.length - 1 - suffix] === edit.newText[edit.newText.length - 1 - suffix]
  ) suffix += 1

  let oldStart = prefix
  let oldEnd = edit.oldText.length - suffix
  let newStart = prefix
  let newEnd = edit.newText.length - suffix
  while (uniqueIndex(originalContent, edit.oldText.slice(oldStart, oldEnd)) < 0) {
    if (oldStart > 0) {
      oldStart -= 1
      newStart -= 1
    }
    if (uniqueIndex(originalContent, edit.oldText.slice(oldStart, oldEnd)) >= 0) break
    if (oldEnd < edit.oldText.length) {
      oldEnd += 1
      newEnd += 1
    }
  }

  const oldText = edit.oldText.slice(oldStart, oldEnd)
  const start = uniqueIndex(originalContent, oldText)
  if (start < 0) throw new Error('not uniquely anchored')
  return { oldText, newText: edit.newText.slice(newStart, newEnd), start, end: start + oldText.length }
}

function changedLines(oldText: string, newText: string): { removed: string[]; added: string[] } {
  const before = oldText ? oldText.split(/\r?\n/) : []
  const after = newText ? newText.split(/\r?\n/) : []
  let prefix = 0
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1
  let suffix = 0
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) suffix += 1
  return {
    removed: before.slice(prefix, before.length - suffix),
    added: after.slice(prefix, after.length - suffix)
  }
}

function formatPatch(relativePath: string, edits: ResolvedProposalTextEdit[]): {
  additions: number
  deletions: number
  patch: string
} {
  let additions = 0
  let deletions = 0
  const hunks = edits.map((edit, index) => {
    const lines = changedLines(edit.oldText, edit.newText)
    additions += lines.added.length
    deletions += lines.removed.length
    return [
      `@@ edit ${index + 1} @@`,
      ...lines.removed.map((line) => `-${line}`),
      ...lines.added.map((line) => `+${line}`)
    ].join('\n')
  })
  return {
    additions,
    deletions,
    patch: `--- before/${relativePath}\n+++ after/${relativePath}\n${hunks.join('\n')}`.slice(0, 18_000)
  }
}

function materializeResolvedEdits(
  originalContent: string,
  edits: ResolvedProposalTextEdit[],
  relativePath: string
): MaterializedProposalUpdate {
  const sorted = [...edits].sort((left, right) => left.start - right.start)
  for (const [index, edit] of sorted.entries()) {
    if (
      !Number.isInteger(edit.start) || !Number.isInteger(edit.end) ||
      edit.start < 0 || edit.end < edit.start || edit.end > originalContent.length ||
      edit.oldText !== originalContent.slice(edit.start, edit.end) ||
      edit.oldText === edit.newText || edit.oldText.length > maxEditCharacters ||
      edit.newText.length > maxEditCharacters || edit.oldText.includes('\0') || edit.newText.includes('\0')
    ) throw new Error(`Edit ${index + 1} for ${relativePath} is invalid.`)
    if (index > 0 && edit.start < sorted[index - 1].end) {
      throw new Error(`The proposed edits overlap in ${relativePath}. Generate a fresh proposal.`)
    }
  }

  let cursor = 0
  let content = ''
  for (const edit of sorted) {
    content += originalContent.slice(cursor, edit.start)
    content += edit.newText
    cursor = edit.end
  }
  content += originalContent.slice(cursor)
  if (content.length > maxFileCharacters) throw new Error(`The proposed result for ${relativePath} is too large.`)
  return { content, edits: sorted, ...formatPatch(relativePath, sorted) }
}

export function materializeResolvedProposalEdits(
  originalContent: string,
  edits: ResolvedProposalTextEdit[],
  relativePath: string
): MaterializedProposalUpdate {
  if (!Array.isArray(edits) || edits.length === 0 || edits.length > maxEdits) {
    throw new Error(`The proposal contains an invalid number of edits for ${relativePath}.`)
  }
  return materializeResolvedEdits(originalContent, edits, relativePath)
}

export function materializeProposalEdits(
  originalContent: string,
  requestedEdits: ProposalTextEdit[],
  relativePath: string
): MaterializedProposalUpdate {
  if (!Array.isArray(requestedEdits) || requestedEdits.length === 0 || requestedEdits.length > maxEdits) {
    throw new Error(`The proposal contains an invalid number of edits for ${relativePath}.`)
  }

  const edits = requestedEdits.map((edit, index): ResolvedProposalTextEdit => {
    if (
      !edit ||
      typeof edit.oldText !== 'string' ||
      typeof edit.newText !== 'string' ||
      edit.oldText.length > maxEditCharacters ||
      edit.newText.length > maxEditCharacters ||
      edit.oldText.includes('\0') ||
      edit.newText.includes('\0')
    ) throw new Error(`Edit ${index + 1} for ${relativePath} is invalid.`)
    if (edit.oldText === edit.newText) throw new Error(`Edit ${index + 1} for ${relativePath} does not change anything.`)

    if (edit.oldText.length === 0) {
      if (originalContent.length > 0 || requestedEdits.length !== 1) {
        throw new Error(`Edit ${index + 1} is not uniquely anchored in ${relativePath}. Generate a fresh proposal.`)
      }
      return { ...edit, start: 0, end: 0 }
    }

    if (!originalContent.includes(edit.oldText)) {
      throw new Error(`Edit ${index + 1} does not exactly match ${relativePath}. Generate a fresh proposal.`)
    }
    const start = uniqueIndex(originalContent, edit.oldText)
    if (start < 0) {
      throw new Error(`Edit ${index + 1} is not uniquely anchored in ${relativePath}. Generate a fresh proposal.`)
    }
    if (edit.oldText !== originalContent) return { ...edit, start, end: start + edit.oldText.length }
    try {
      return minimizeEdit(originalContent, edit)
    } catch {
      throw new Error(`Edit ${index + 1} is not uniquely anchored in ${relativePath}. Generate a fresh proposal.`)
    }
  }).sort((left, right) => left.start - right.start)

  return materializeResolvedEdits(originalContent, edits, relativePath)
}

export function detectEol(content: string): '\n' | '\r\n' {
  const crlf = content.match(/\r\n/g)?.length ?? 0
  const lf = (content.match(/\n/g)?.length ?? 0) - crlf
  return crlf > lf ? '\r\n' : '\n'
}

export function convertEol(content: string, eol: '\n' | '\r\n'): string {
  const normalized = content.replace(/\r\n/g, '\n')
  return eol === '\n' ? normalized : normalized.replace(/\n/g, '\r\n')
}

function matchesReviewedSelection(
  originalContent: string,
  reviewedContent: string,
  edits: ResolvedProposalTextEdit[],
  normalize: (value: string) => string
): boolean {
  const reviewed = normalize(reviewedContent)
  let originalCursor = 0
  let reviewedPositions = new Set([0])

  for (const edit of edits) {
    const unchanged = normalize(originalContent.slice(originalCursor, edit.start))
    const oldText = normalize(edit.oldText)
    const newText = normalize(edit.newText)
    const nextPositions = new Set<number>()
    for (const position of reviewedPositions) {
      if (!reviewed.startsWith(unchanged, position)) continue
      const choiceStart = position + unchanged.length
      if (reviewed.startsWith(oldText, choiceStart)) nextPositions.add(choiceStart + oldText.length)
      if (reviewed.startsWith(newText, choiceStart)) nextPositions.add(choiceStart + newText.length)
      if (nextPositions.size > maxReviewStates) return false
    }
    if (nextPositions.size === 0) return false
    reviewedPositions = nextPositions
    originalCursor = edit.end
  }

  const suffix = normalize(originalContent.slice(originalCursor))
  return [...reviewedPositions].some((position) =>
    reviewed.startsWith(suffix, position) && position + suffix.length === reviewed.length
  )
}

export function isReviewedEditSelection(
  originalContent: string,
  reviewedContent: string,
  edits: ResolvedProposalTextEdit[]
): boolean {
  return matchesReviewedSelection(originalContent, reviewedContent, edits, (value) => value)
}

// Monaco diff models can normalize CRLF to LF while the user reviews blocks;
// this variant compares with CRLF folded to LF so such reviews still validate.
export function isReviewedEditSelectionEolTolerant(
  originalContent: string,
  reviewedContent: string,
  edits: ResolvedProposalTextEdit[]
): boolean {
  return matchesReviewedSelection(originalContent, reviewedContent, edits, (value) => value.replace(/\r\n/g, '\n'))
}
