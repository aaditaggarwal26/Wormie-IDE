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

    const start = originalContent.indexOf(edit.oldText)
    if (start < 0) throw new Error(`Edit ${index + 1} does not exactly match ${relativePath}. Generate a fresh proposal.`)
    if (originalContent.indexOf(edit.oldText, start + 1) >= 0) {
      throw new Error(`Edit ${index + 1} is not uniquely anchored in ${relativePath}. Generate a fresh proposal.`)
    }
    return { ...edit, start, end: start + edit.oldText.length }
  }).sort((left, right) => left.start - right.start)

  for (let index = 1; index < edits.length; index += 1) {
    if (edits[index].start < edits[index - 1].end) {
      throw new Error(`The proposed edits overlap in ${relativePath}. Generate a fresh proposal.`)
    }
  }

  let cursor = 0
  let content = ''
  for (const edit of edits) {
    content += originalContent.slice(cursor, edit.start)
    content += edit.newText
    cursor = edit.end
  }
  content += originalContent.slice(cursor)
  if (content.length > maxFileCharacters) throw new Error(`The proposed result for ${relativePath} is too large.`)

  return { content, edits, ...formatPatch(relativePath, edits) }
}

export function isReviewedEditSelection(
  originalContent: string,
  reviewedContent: string,
  edits: ResolvedProposalTextEdit[]
): boolean {
  let originalCursor = 0
  let reviewedPositions = new Set([0])

  for (const edit of edits) {
    const unchanged = originalContent.slice(originalCursor, edit.start)
    const nextPositions = new Set<number>()
    for (const position of reviewedPositions) {
      if (!reviewedContent.startsWith(unchanged, position)) continue
      const choiceStart = position + unchanged.length
      if (reviewedContent.startsWith(edit.oldText, choiceStart)) nextPositions.add(choiceStart + edit.oldText.length)
      if (reviewedContent.startsWith(edit.newText, choiceStart)) nextPositions.add(choiceStart + edit.newText.length)
      if (nextPositions.size > maxReviewStates) return false
    }
    if (nextPositions.size === 0) return false
    reviewedPositions = nextPositions
    originalCursor = edit.end
  }

  const suffix = originalContent.slice(originalCursor)
  return [...reviewedPositions].some((position) =>
    reviewedContent.startsWith(suffix, position) && position + suffix.length === reviewedContent.length
  )
}
