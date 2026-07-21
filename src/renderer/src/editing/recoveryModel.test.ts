import { describe, expect, it } from 'vitest'
import { buildEditorRecovery, mergeRecoveredFile } from './recoveryModel'

describe('recovery model', () => {
  it('restores dirty content over the current disk baseline', () => {
    const restored = mergeRecoveredFile(
      { path: '/repo/a.ts', name: 'a.ts', language: 'typescript', content: 'disk', fingerprint: 'disk-hash' },
      { path: '/repo/a.ts', dirtyContent: 'local', view: { line: 4, column: 2, scrollTop: 30, scrollLeft: 0 } }
    )

    expect(restored).toMatchObject({ content: 'local', savedContent: 'disk', fingerprint: 'disk-hash' })
  })

  it('returns null for a deleted file', () => {
    expect(mergeRecoveredFile(null, { path: '/repo/deleted.ts' })).toBeNull()
  })

  it('persists dirty text but not clean file contents', () => {
    const state = buildEditorRecovery('/repo', [
      { path: '/repo/clean.ts', name: 'clean.ts', language: 'typescript', content: 'a', savedContent: 'a', fingerprint: 'a', view: { line: 1, column: 1, scrollTop: 0, scrollLeft: 0 } },
      { path: '/repo/dirty.ts', name: 'dirty.ts', language: 'typescript', content: 'local', savedContent: 'disk', fingerprint: 'b', view: { line: 2, column: 1, scrollTop: 0, scrollLeft: 0 } }
    ], '/repo/dirty.ts', [], { mode: 'off', delayMs: 1000, saveOnExit: false })

    expect(state.schemaVersion).toBe(2)
    expect(state.documents[0].dirtyContent).toBeUndefined()
    expect(state.documents[1].dirtyContent).toBe('local')
  })
})
