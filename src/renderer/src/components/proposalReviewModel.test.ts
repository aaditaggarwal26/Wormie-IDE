import { describe, expect, it } from 'vitest'
import { languageForPath, lineChangeRange, proposalReviewProgress, resolveProposalPath } from './proposalReviewModel'

describe('proposal review model', () => {
  it('converts Monaco line changes into full-line edit ranges', () => {
    expect(lineChangeRange({
      originalStartLineNumber: 3, originalEndLineNumber: 0,
      modifiedStartLineNumber: 4, modifiedEndLineNumber: 5
    }, 'original')).toEqual({ startLineNumber: 4, startColumn: 1, endLineNumber: 4, endColumn: 1 })

    expect(lineChangeRange({
      originalStartLineNumber: 3, originalEndLineNumber: 4,
      modifiedStartLineNumber: 2, modifiedEndLineNumber: 0
    }, 'modified')).toEqual({ startLineNumber: 3, startColumn: 1, endLineNumber: 3, endColumn: 1 })
  })

  it('tracks completion without treating unopened files as reviewed', () => {
    const pending = proposalReviewProgress([
      { pendingBlocks: 0, keptBlocks: 1, undoneBlocks: 0, originalContent: 'kept', modifiedContent: 'kept' },
      { pendingBlocks: null, keptBlocks: 0, undoneBlocks: 0, originalContent: 'before', modifiedContent: 'after' }
    ])
    expect(pending).toMatchObject({ reviewedFiles: 1, totalFiles: 2, complete: false, hasKeptChanges: true })
  })

  it('maps file paths without platform-specific Node APIs in the renderer', () => {
    expect(resolveProposalPath('/repo', 'src/app.ts', 'darwin')).toBe('/repo/src/app.ts')
    expect(resolveProposalPath('C:\\repo', 'src/app.ts', 'win32')).toBe('C:\\repo\\src\\app.ts')
    expect(languageForPath('/repo/src/app.tsx')).toBe('typescript')
  })
})
