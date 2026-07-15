import { describe, expect, it } from 'vitest'
import type { ChangeInput } from '../../shared/contracts'
import { fingerprintChange } from './fingerprint'

const change: ChangeInput = {
  id: 'proposal-1', source: 'ai_proposal', title: 'State refactor', files: [
    { path: 'src/b.ts', status: 'modified', additions: 1, deletions: 1, beforeContent: 'old-b', afterContent: 'new-b' },
    { path: 'src/a.ts', status: 'added', additions: 1, deletions: 0, afterContent: 'new-a' }
  ]
}

describe('fingerprintChange', () => {
  it('is stable when file input ordering changes', () => {
    expect(fingerprintChange(change)).toBe(fingerprintChange({ ...change, files: [...change.files].reverse() }))
  })

  it('changes when material content changes', () => {
    const edited = { ...change, files: change.files.map((file) => file.path === 'src/a.ts' ? { ...file, afterContent: 'different' } : file) }
    expect(fingerprintChange(edited)).not.toBe(fingerprintChange(change))
  })

  it('does not bind a pass to mutable display copy', () => {
    expect(fingerprintChange({ ...change, title: 'Renamed title' })).toBe(fingerprintChange(change))
  })

  it('ignores line endings and trailing formatting whitespace', () => {
    const formatted = { ...change, files: change.files.map((file) => file.afterContent ? { ...file, afterContent: `${file.afterContent.replace(/\n/g, '\r\n')}   \r\n` } : file) }
    expect(fingerprintChange(formatted)).toBe(fingerprintChange(change))
  })
})
