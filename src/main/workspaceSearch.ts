import type { SearchMatch, SearchOptions, WorkspaceReplacementEdit } from '../shared/contracts'

const maximumMatchesPerFile = 1_000

export function compileSearchPattern(options: Pick<SearchOptions, 'query' | 'caseSensitive' | 'wholeWord' | 'useRegex'>): RegExp {
  const source = options.useRegex
    ? options.query
    : options.query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  try {
    return new RegExp(options.wholeWord ? `\\b(?:${source})\\b` : source, options.caseSensitive ? 'gu' : 'giu')
  } catch {
    throw new Error('Enter a valid regular expression.')
  }
}

function expandReplacement(template: string, match: RegExpExecArray): string {
  return template.replace(/\$\$|\$&|\$<([^>]+)>|\$(\d{1,2})/g, (token, name: string | undefined, indexText: string | undefined) => {
    if (token === '$$') return '$'
    if (token === '$&') return match[0]
    if (name) return match.groups?.[name] ?? token
    const index = Number(indexText)
    return index > 0 && index < match.length ? (match[index] ?? '') : token
  })
}

export function findTextMatches(content: string, pattern: RegExp, replacement: string): SearchMatch[] {
  const matches: SearchMatch[] = []
  pattern.lastIndex = 0
  let line = 1
  let lineStart = 0
  let nextLineBreak = content.indexOf('\n')
  let match: RegExpExecArray | null
  while ((match = pattern.exec(content)) && matches.length < maximumMatchesPerFile) {
    const start = match.index
    const end = start + match[0].length
    while (nextLineBreak !== -1 && nextLineBreak < start) {
      line += 1
      lineStart = nextLineBreak + 1
      nextLineBreak = content.indexOf('\n', lineStart)
    }
    const lineEnd = nextLineBreak === -1 ? content.length : nextLineBreak
    matches.push({
      id: `${start}:${end}`,
      start,
      end,
      line,
      column: start - lineStart + 1,
      preview: content.slice(lineStart, lineEnd).replace(/\r$/, '').trim().slice(0, 240),
      matchText: match[0],
      replacement: expandReplacement(replacement, match)
    })
    if (match[0].length === 0) pattern.lastIndex += 1
  }
  return matches
}

export function detectLineEnding(content: string): '\n' | '\r\n' {
  return content.includes('\r\n') ? '\r\n' : '\n'
}

export function normalizeReplacementLineEndings(replacement: string, lineEnding: '\n' | '\r\n'): string {
  return replacement.replace(/\r\n|\r|\n/g, lineEnding)
}

export function applyReplacementEdits(content: string, edits: WorkspaceReplacementEdit[]): string {
  const ordered = [...edits].sort((left, right) => right.start - left.start)
  let previousStart = content.length + 1
  let next = content
  const lineEnding = detectLineEnding(content)
  for (const edit of ordered) {
    if (!Number.isInteger(edit.start) || !Number.isInteger(edit.end) || edit.start < 0 || edit.end < edit.start || edit.end > content.length) {
      throw new Error('A replacement range is invalid.')
    }
    if (edit.end > previousStart) throw new Error('Replacement ranges overlap.')
    if (content.slice(edit.start, edit.end) !== edit.expectedText) throw new Error('The file changed after the search.')
    next = `${next.slice(0, edit.start)}${normalizeReplacementLineEndings(edit.replacement, lineEnding)}${next.slice(edit.end)}`
    previousStart = edit.start
  }
  return next
}
