import { describe, expect, it } from 'vitest'
import { assertExpectedFingerprint, fingerprintContent } from './fileVersion'

describe('file version safety', () => {
  it('produces stable content fingerprints', () => {
    expect(fingerprintContent('same')).toBe(fingerprintContent('same'))
    expect(fingerprintContent('same')).not.toBe(fingerprintContent('changed'))
  })

  it('rejects stale writes', () => {
    const expected = fingerprintContent('expected')
    expect(() => assertExpectedFingerprint(expected, fingerprintContent('actual'))).toThrow(/changed on disk/i)
    expect(() => assertExpectedFingerprint(expected, expected)).not.toThrow()
  })
})
