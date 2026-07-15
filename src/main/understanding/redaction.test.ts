import { describe, expect, it } from 'vitest'
import type { ChangeInput } from '../../shared/contracts'
import { sanitizeChangeContext } from './redaction'

describe('sanitizeChangeContext', () => {
  it('removes sensitive files, lockfile noise, binaries, and likely credentials', () => {
    const input: ChangeInput = {
      id: 'git-1', source: 'git_commit', title: 'Change auth', files: [
        { path: '.env', status: 'modified', additions: 1, deletions: 1, patch: '+API_KEY=sk-abcdefghijklmnopqrst' },
        { path: 'package-lock.json', status: 'modified', additions: 400, deletions: 300, patch: '+noise' },
        { path: 'logo.png', status: 'added', additions: 0, deletions: 0, binary: true },
        { path: 'src/auth.ts', status: 'modified', additions: 2, deletions: 1, patch: '+const password = "very-secret-value"' }
      ]
    }
    const output = sanitizeChangeContext(input)
    expect(output.files.map((file) => file.path)).toEqual(['src/auth.ts'])
    expect(output.files[0].patch).toContain('[REDACTED]')
    expect(JSON.stringify(output)).not.toContain('very-secret-value')
  })

  it('caps patch context while preserving the relevant file record', () => {
    const output = sanitizeChangeContext({
      id: 'x', source: 'git_commit', title: 'Large', files: [
        { path: 'src/large.ts', status: 'modified', additions: 9000, deletions: 0, patch: 'x'.repeat(200_000) }
      ]
    })
    expect(output.files[0].patch!.length).toBeLessThanOrEqual(20_020)
  })
})
