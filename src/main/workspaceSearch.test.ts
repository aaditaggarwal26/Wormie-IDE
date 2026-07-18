import { describe, expect, it } from 'vitest'
import {
  applyReplacementEdits,
  compileSearchPattern,
  detectLineEnding,
  findTextMatches,
  normalizeReplacementLineEndings
} from './workspaceSearch'

describe('workspace search matching', () => {
  it('supports case-sensitive and whole-word searches', () => {
    const pattern = compileSearchPattern({ query: 'Cat', caseSensitive: true, wholeWord: true, useRegex: false })
    expect(findTextMatches('Cat catalog cat Cat', pattern, '').map((match) => match.matchText)).toEqual(['Cat', 'Cat'])
  })

  it('reports invalid regular expressions', () => {
    expect(() => compileSearchPattern({ query: '[', caseSensitive: false, wholeWord: false, useRegex: true }))
      .toThrow('regular expression')
  })

  it('previews capture-group replacements', () => {
    const pattern = compileSearchPattern({ query: '(first) (last)', caseSensitive: false, wholeWord: false, useRegex: true })
    const [match] = findTextMatches('first last', pattern, '$2, $1')
    expect(match.replacement).toBe('last, first')
  })
})

describe('workspace replacement', () => {
  it('applies non-overlapping edits from the end of the file', () => {
    expect(applyReplacementEdits('one two one', [
      { start: 0, end: 3, expectedText: 'one', replacement: '1' },
      { start: 8, end: 11, expectedText: 'one', replacement: '1' }
    ])).toBe('1 two 1')
  })

  it('rejects stale expected text and overlapping ranges', () => {
    expect(() => applyReplacementEdits('changed', [{ start: 0, end: 3, expectedText: 'old', replacement: 'new' }]))
      .toThrow('changed after the search')
    expect(() => applyReplacementEdits('abcdef', [
      { start: 0, end: 4, expectedText: 'abcd', replacement: 'x' },
      { start: 2, end: 5, expectedText: 'cde', replacement: 'y' }
    ])).toThrow('overlap')
  })

  it('preserves CRLF and LF line endings', () => {
    expect(detectLineEnding('a\r\nb\r\n')).toBe('\r\n')
    expect(detectLineEnding('a\nb\n')).toBe('\n')
    expect(normalizeReplacementLineEndings('x\ny', '\r\n')).toBe('x\r\ny')
  })
})
