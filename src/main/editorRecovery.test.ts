import { describe, expect, it } from 'vitest'
import { parseEditorRecovery } from './editorRecovery'

describe('editor recovery persistence', () => {
  it('ignores corrupt and outdated state', () => {
    expect(parseEditorRecovery(null)).toBeNull()
    expect(parseEditorRecovery({ schemaVersion: 99 })).toBeNull()
    expect(parseEditorRecovery({ schemaVersion: 1, workspaceRoot: 42, documents: [] })).toBeNull()
  })

  it('bounds documents and recovered dirty content', () => {
    const documents = Array.from({ length: 40 }, (_, index) => ({
      path: `/repo/file-${index}.ts`,
      dirtyContent: 'x'.repeat(100_000),
      view: { line: 1, column: 1, scrollTop: 0, scrollLeft: 0 }
    }))
    const parsed = parseEditorRecovery({
      schemaVersion: 1,
      workspaceRoot: '/repo',
      activePath: '/repo/file-0.ts',
      autosave: { mode: 'afterDelay', delayMs: 1000 },
      documents
    })

    expect(parsed?.documents.length).toBeLessThanOrEqual(30)
    expect(parsed?.documents.reduce((total, document) => total + (document.dirtyContent?.length ?? 0), 0)).toBeLessThanOrEqual(2_000_000)
  })

  it('repairs invalid view and autosave values', () => {
    const parsed = parseEditorRecovery({
      schemaVersion: 1,
      workspaceRoot: '/repo',
      activePath: null,
      autosave: { mode: 'afterDelay', delayMs: 2 },
      documents: [{ path: '/repo/a.ts', view: { line: -4, column: 0, scrollTop: -1, scrollLeft: 'bad' } }]
    })

    expect(parsed?.autosave).toEqual({ mode: 'off', delayMs: 1000 })
    expect(parsed?.documents[0].view).toEqual({ line: 1, column: 1, scrollTop: 0, scrollLeft: 0 })
  })
})
