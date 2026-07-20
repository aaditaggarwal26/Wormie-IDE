export type FileCandidate = {
  path: string
  relativePath: string
  name: string
}

export type RankedFile = {
  file: FileCandidate
  matchIndexes: number[]
  score: number
}

type FuzzyMatch = { indexes: number[]; score: number }

export function fuzzyMatch(value: string, rawQuery: string): FuzzyMatch | null {
  const query = rawQuery.trim().toLocaleLowerCase()
  if (!query) return { indexes: [], score: 0 }
  const normalized = value.toLocaleLowerCase()
  const indexes: number[] = []
  let cursor = 0
  let gapPenalty = 0

  for (const character of query) {
    const index = normalized.indexOf(character, cursor)
    if (index < 0) return null
    if (indexes.length > 0) gapPenalty += index - indexes[indexes.length - 1] - 1
    indexes.push(index)
    cursor = index + 1
  }

  const contiguous = normalized.includes(query)
  const prefix = normalized.startsWith(query)
  return {
    indexes,
    score: (prefix ? 500 : 0) + (contiguous ? 250 : 0) - gapPenalty * 5 - indexes[0]
  }
}

export function rankFiles(query: string, files: FileCandidate[]): RankedFile[] {
  const trimmed = query.trim()
  if (!trimmed) return files.map((file) => ({ file, matchIndexes: [], score: 0 }))

  return files.flatMap((file): RankedFile[] => {
    const pathMatch = fuzzyMatch(file.relativePath, trimmed)
    if (!pathMatch) return []
    const filenameOffset = file.relativePath.length - file.name.length
    const filenameMatch = fuzzyMatch(file.name, trimmed)
    const matchIndexes = filenameMatch
      ? filenameMatch.indexes.map((index) => index + filenameOffset)
      : pathMatch.indexes
    const score = (filenameMatch ? 10_000 + filenameMatch.score * 10 : pathMatch.score) - file.relativePath.length
    return [{ file, matchIndexes, score }]
  }).sort((left, right) => right.score - left.score || left.file.relativePath.localeCompare(right.file.relativePath))
}
