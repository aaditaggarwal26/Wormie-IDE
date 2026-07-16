import { describe, expect, it } from 'vitest'
import { hasReviewedChange, resolveReviewedChanges } from './proposalReview'

const changes = [
  { relativePath: 'src/a.ts', action: 'update' as const, content: 'after a', beforeContent: 'before a' },
  { relativePath: 'src/b.ts', action: 'create' as const, content: 'new b', beforeContent: null }
]

describe('proposal review validation', () => {
  it('preserves reviewed contents and block decisions by path', () => {
    const reviewed = resolveReviewedChanges(changes, [
      { relativePath: 'src/b.ts', content: '', keptBlocks: 0, undoneBlocks: 1 },
      { relativePath: 'src/a.ts', content: 'partial a', keptBlocks: 1, undoneBlocks: 2 }
    ])

    expect(reviewed.map((change) => change.relativePath)).toEqual(['src/b.ts', 'src/a.ts'])
    expect(reviewed[1].reviewedContent).toBe('partial a')
    expect(hasReviewedChange(reviewed[0])).toBe(false)
    expect(hasReviewedChange(reviewed[1])).toBe(true)
  })

  it('requires one unique review for every proposed file', () => {
    expect(() => resolveReviewedChanges(changes, [
      { relativePath: 'src/a.ts', content: 'after a', keptBlocks: 1, undoneBlocks: 0 }
    ])).toThrow(/every proposed file/i)

    expect(() => resolveReviewedChanges(changes, [
      { relativePath: 'src/a.ts', content: 'after a', keptBlocks: 1, undoneBlocks: 0 },
      { relativePath: 'src/a.ts', content: 'after a', keptBlocks: 1, undoneBlocks: 0 }
    ])).toThrow(/duplicate/i)
  })

  it('rejects unknown paths, invalid counts, and unsafe content', () => {
    expect(() => resolveReviewedChanges(changes, [
      { relativePath: 'src/a.ts', content: 'after a', keptBlocks: -1, undoneBlocks: 0 },
      { relativePath: 'src/b.ts', content: 'new b', keptBlocks: 1, undoneBlocks: 0 }
    ])).toThrow(/block count/i)

    expect(() => resolveReviewedChanges(changes, [
      { relativePath: 'src/a.ts', content: 'after a', keptBlocks: 1, undoneBlocks: 0 },
      { relativePath: 'src/other.ts', content: 'new b', keptBlocks: 1, undoneBlocks: 0 }
    ])).toThrow(/unknown file/i)

    expect(() => resolveReviewedChanges(changes, [
      { relativePath: 'src/a.ts', content: 'bad\0content', keptBlocks: 1, undoneBlocks: 0 },
      { relativePath: 'src/b.ts', content: 'new b', keptBlocks: 1, undoneBlocks: 0 }
    ])).toThrow(/invalid/i)
  })
})
