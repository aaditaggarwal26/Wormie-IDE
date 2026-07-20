import { describe, expect, it } from 'vitest'
import { materializeProposalEdits } from './proposalEdits'
import { hasReviewedChange, resolveReviewedChanges } from './proposalReview'

const update = materializeProposalEdits('before a', [{ oldText: 'before a', newText: 'after a' }], 'src/a.ts')
const changes = [
  {
    relativePath: 'src/a.ts', action: 'update' as const, content: update.content,
    beforeContent: 'before a', surgicalEdits: update.edits
  },
  {
    relativePath: 'src/b.ts', action: 'create' as const, content: 'new b',
    beforeContent: null, surgicalEdits: null
  }
]

describe('proposal review validation', () => {
  it('preserves reviewed contents and block decisions by path', () => {
    const reviewed = resolveReviewedChanges(changes, [
      { relativePath: 'src/b.ts', content: '', keptBlocks: 0, undoneBlocks: 1 },
      { relativePath: 'src/a.ts', content: 'after a', keptBlocks: 1, undoneBlocks: 0 }
    ])

    expect(reviewed.map((change) => change.relativePath)).toEqual(['src/b.ts', 'src/a.ts'])
    expect(reviewed[1].reviewedContent).toBe('after a')
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

  it('restores the original line endings when a review came back EOL-normalized', () => {
    const original = 'first\r\nvalue = false\r\nlast\r\n'
    const crlfUpdate = materializeProposalEdits(original, [{ oldText: 'false', newText: 'true' }], 'src/c.ts')
    const crlfChanges = [{
      relativePath: 'src/c.ts', action: 'update' as const, content: crlfUpdate.content,
      beforeContent: original, surgicalEdits: crlfUpdate.edits
    }]

    const reviewed = resolveReviewedChanges(crlfChanges, [
      { relativePath: 'src/c.ts', content: 'first\nvalue = true\nlast\n', keptBlocks: 1, undoneBlocks: 0 }
    ])
    expect(reviewed[0].reviewedContent).toBe('first\r\nvalue = true\r\nlast\r\n')
    expect(hasReviewedChange(reviewed[0])).toBe(true)

    expect(() => resolveReviewedChanges(crlfChanges, [
      { relativePath: 'src/c.ts', content: 'first\nvalue = tampered\nlast\n', keptBlocks: 1, undoneBlocks: 0 }
    ])).toThrow(/not part of this proposal/i)
  })

  it('rejects content that was not proposed by the agent', () => {
    expect(() => resolveReviewedChanges(changes, [
      { relativePath: 'src/a.ts', content: 'arbitrary replacement', keptBlocks: 1, undoneBlocks: 0 },
      { relativePath: 'src/b.ts', content: 'new b', keptBlocks: 1, undoneBlocks: 0 }
    ])).toThrow(/not part of this proposal/i)

    expect(() => resolveReviewedChanges(changes, [
      { relativePath: 'src/a.ts', content: 'after a', keptBlocks: 1, undoneBlocks: 0 },
      { relativePath: 'src/b.ts', content: 'partial new file', keptBlocks: 1, undoneBlocks: 0 }
    ])).toThrow(/not part of this proposal/i)
  })
})
