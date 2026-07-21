import { afterEach, describe, expect, it } from 'vitest'
import type { CodeProposal } from '@shared/contracts'
import { useWorkbench } from './workbench'

afterEach(() => useWorkbench.setState({
  workspace: null,
  documents: [],
  activePath: null,
  revealLine: null,
  proposalReview: null,
  closedPaths: [],
  externalChanges: {},
  autosave: { mode: 'afterDelay', delayMs: 1000, saveOnExit: true }
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
      documents: [{
        path: filePath,
        name: 'value.ts',
        language: 'typescript',
        content: before,
        savedContent: before,
        fingerprint: '0'.repeat(64),
        view: { line: 1, column: 1, scrollTop: 0, scrollLeft: 0 }
      }],
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

describe('safe editor state', () => {
  const file = (path: string, content = 'disk'): import('./workbench').EditorDocument => ({
    path,
    name: path.split('/').at(-1)!,
    language: 'typescript',
    content,
    savedContent: 'disk',
    fingerprint: 'a'.repeat(64),
    view: { line: 1, column: 1, scrollTop: 0, scrollLeft: 0 }
  })

  it('records closed editors and removes them after reopening', () => {
    useWorkbench.setState({ documents: [file('/repo/a.ts')], activePath: '/repo/a.ts', closedPaths: [] })
    useWorkbench.getState().closeDocument('/repo/a.ts')
    expect(useWorkbench.getState().closedPaths).toEqual(['/repo/a.ts'])
    useWorkbench.getState().removeClosedPath('/repo/a.ts')
    expect(useWorkbench.getState().closedPaths).toEqual([])
  })

  it('reloads clean disk content and preserves local content when explicitly kept', () => {
    useWorkbench.setState({ documents: [file('/repo/a.ts', 'local')], activePath: '/repo/a.ts', externalChanges: {} })
    const diskFile = { path: '/repo/a.ts', name: 'a.ts', language: 'typescript', content: 'external', fingerprint: 'b'.repeat(64) }
    useWorkbench.getState().setExternalChange('/repo/a.ts', { kind: 'changed', diskFile })
    useWorkbench.getState().keepLocalVersion('/repo/a.ts', diskFile.fingerprint)
    expect(useWorkbench.getState().documents[0]).toMatchObject({ content: 'local', savedContent: 'disk', fingerprint: diskFile.fingerprint })
    expect(useWorkbench.getState().externalChanges).toEqual({})

    useWorkbench.getState().replaceDocumentFromDisk(diskFile)
    expect(useWorkbench.getState().documents[0]).toMatchObject({ content: 'external', savedContent: 'external' })
  })
})
