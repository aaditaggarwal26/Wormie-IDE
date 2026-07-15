import { describe, expect, it } from 'vitest'
import { buildStagedChangeInput, validateCommitMessage } from './gitChange'
import { classifyChange, defaultUnderstandingSettings } from './understanding/significance'
import { fingerprintChange } from './understanding/fingerprint'

const majorNumstat = '8\t2\tsrc/auth/session.ts\n12\t1\tsrc/routes/account.ts\n'
const majorStatus = 'M\tsrc/auth/session.ts\nM\tsrc/routes/account.ts\n'
const majorPatch = 'diff --git a/src/auth/session.ts b/src/auth/session.ts\n+++ b/src/auth/session.ts\n+httpOnly: true\ndiff --git a/src/routes/account.ts b/src/routes/account.ts\n+++ b/src/routes/account.ts\n+authorize(user)\n'

describe('staged change understanding', () => {
  it('builds a major, fingerprinted staged change from Git output', () => {
    const change = buildStagedChangeInput('C:\\repo', majorNumstat, majorStatus, majorPatch)
    const result = classifyChange(change, defaultUnderstandingSettings)
    expect(change.source).toBe('git_commit')
    expect(change.files).toHaveLength(2)
    expect(result.quizRequired).toBe(true)
    expect(fingerprintChange(change)).toHaveLength(64)
  })

  it('keeps tiny staged documentation changes below the default gate', () => {
    const change = buildStagedChangeInput('C:\\repo', '1\t1\tREADME.md\n', 'M\tREADME.md\n', '+wording')
    expect(classifyChange(change, defaultUnderstandingSettings).quizRequired).toBe(false)
  })

  it('changes the fingerprint when the staged diff changes', () => {
    const first = buildStagedChangeInput('C:\\repo', majorNumstat, majorStatus, majorPatch)
    const second = buildStagedChangeInput('C:\\repo', majorNumstat, majorStatus, `${majorPatch}+sameSite: strict\n`)
    expect(fingerprintChange(first)).not.toBe(fingerprintChange(second))
  })

  it('validates commit messages before invoking Git', () => {
    expect(validateCommitMessage('feat: protect session cookies')).toBe('feat: protect session cookies')
    expect(() => validateCommitMessage('   ')).toThrow(/message/i)
    expect(() => validateCommitMessage('x'.repeat(2_001))).toThrow(/2,000/i)
  })
})
