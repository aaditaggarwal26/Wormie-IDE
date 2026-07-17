import { describe, expect, it } from 'vitest'
import { isReviewedEditSelection, materializeProposalEdits } from './proposalEdits'
import { proposalDraftSchema } from './schemas'

describe('surgical proposal edits', () => {
  it('changes only exact non-overlapping text and builds a compact patch', () => {
    const original = 'header\r\nconst first = 1\r\nmiddle\r\nconst second = 2\r\nfooter\r\n'
    const result = materializeProposalEdits(original, [
      { oldText: 'const first = 1', newText: 'const first = 10' },
      { oldText: 'const second = 2', newText: 'const second = 20' }
    ], 'src/value.ts')

    expect(result.content).toBe('header\r\nconst first = 10\r\nmiddle\r\nconst second = 20\r\nfooter\r\n')
    expect(result).toMatchObject({ additions: 2, deletions: 2 })
    expect(result.patch).not.toContain('header')
    expect(result.patch).not.toContain('middle')
    expect(result.patch).not.toContain('footer')
  })

  it('rejects missing, ambiguous, no-op, overlapping, and unsafe edits', () => {
    expect(() => materializeProposalEdits('same same', [
      { oldText: 'same', newText: 'changed' }
    ], 'a.ts')).toThrow(/uniquely anchored/i)

    expect(() => materializeProposalEdits('before', [
      { oldText: 'missing', newText: 'changed' }
    ], 'a.ts')).toThrow(/exactly match/i)

    expect(() => materializeProposalEdits('before', [
      { oldText: 'before', newText: 'before' }
    ], 'a.ts')).toThrow(/does not change/i)

    expect(() => materializeProposalEdits('abcdef', [
      { oldText: 'bcd', newText: 'B' },
      { oldText: 'cde', newText: 'C' }
    ], 'a.ts')).toThrow(/overlap/i)

    expect(() => materializeProposalEdits('before', [
      { oldText: 'before', newText: 'bad\0content' }
    ], 'a.ts')).toThrow(/invalid/i)
  })

  it('recognizes only reviewed combinations of the proposed edits', () => {
    const original = 'alpha\none\nmiddle\ntwo\nomega'
    const result = materializeProposalEdits(original, [
      { oldText: 'one', newText: 'ONE' },
      { oldText: 'two', newText: 'TWO' }
    ], 'a.ts')

    expect(isReviewedEditSelection(original, original, result.edits)).toBe(true)
    expect(isReviewedEditSelection(original, result.content, result.edits)).toBe(true)
    expect(isReviewedEditSelection(original, 'alpha\nONE\nmiddle\ntwo\nomega', result.edits)).toBe(true)
    expect(isReviewedEditSelection(original, 'alpha\nONE\nmiddle\ncustom\nomega', result.edits)).toBe(false)
  })

  it('supports an empty existing file without allowing ambiguous insertions', () => {
    expect(materializeProposalEdits('', [{ oldText: '', newText: 'export {}\n' }], 'empty.ts').content).toBe('export {}\n')
    expect(() => materializeProposalEdits('content', [{ oldText: '', newText: 'prefix' }], 'a.ts')).toThrow(/uniquely anchored/i)
  })

  it('requires update proposals to use edits instead of replacement files', () => {
    const base = { summary: 'Update one value', risks: [], verification: ['Run tests'] }
    expect(proposalDraftSchema.safeParse({
      ...base,
      changes: [{ relativePath: 'a.ts', action: 'update', edits: [{ oldText: 'one', newText: 'two' }], explanation: 'Update it' }]
    }).success).toBe(true)
    expect(proposalDraftSchema.safeParse({
      ...base,
      changes: [{ relativePath: 'a.ts', action: 'update', content: 'whole file', explanation: 'Replace it' }]
    }).success).toBe(false)
  })
})
