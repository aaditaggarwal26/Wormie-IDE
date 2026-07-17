import { afterEach, describe, expect, it } from 'vitest'
import type { CodeProposal } from '@shared/contracts'
import { useWorkbench } from './workbench'

afterEach(() => useWorkbench.setState({
  workspace: null,
  documents: [],
  activePath: null,
  revealLine: null,
  proposalReview: null
}))

describe('proposal preview state', () => {
  it('keeps editor content unchanged until reviewed changes are applied', () => {
    const filePath = '/repo/src/value.ts'
    const before = 'export const value = 1\n'
    const after = 'export const value = 2\n'
    const proposal: CodeProposal = {
      id: 'proposal-1',
      sessionId: 'session-1',
      summary: 'Update the value',
      changes: [{
        relativePath: 'src/value.ts',
        action: 'update',
        originalContent: before,
        content: after,
        explanation: 'Use the new value'
      }],
      risks: [],
      verification: ['Run tests']
    }
    useWorkbench.setState({
      documents: [{ path: filePath, name: 'value.ts', language: 'typescript', content: before, savedContent: before }],
      activePath: filePath,
      proposalReview: null
    })

    useWorkbench.getState().beginProposalReview(proposal, '/repo', 'darwin')

    expect(useWorkbench.getState().documents[0]).toMatchObject({ content: before, savedContent: before })
    expect(useWorkbench.getState().proposalReview?.files[0]).toMatchObject({
      originalContent: before,
      modifiedContent: after
    })

    useWorkbench.getState().updateProposalReviewFile('src/value.ts', {
      modifiedContent: after,
      pendingBlocks: 0,
      keptBlocks: 1
    })
    useWorkbench.getState().completeProposalReview([filePath])

    expect(useWorkbench.getState().documents[0]).toMatchObject({ content: after, savedContent: after })
  })
})
