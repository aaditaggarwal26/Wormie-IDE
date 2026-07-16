import { describe, expect, it } from 'vitest'
import { canPersistAuthSession } from './authStoragePolicy'

describe('canPersistAuthSession', () => {
  it('requires OS encryption', () => {
    expect(canPersistAuthSession('win32', false)).toBe(false)
    expect(canPersistAuthSession('darwin', false)).toBe(false)
  })

  it('accepts protected Windows and macOS storage', () => {
    expect(canPersistAuthSession('win32', true)).toBe(true)
    expect(canPersistAuthSession('darwin', true)).toBe(true)
  })

  it('rejects weak or uninitialized Linux storage', () => {
    expect(canPersistAuthSession('linux', true, 'basic_text')).toBe(false)
    expect(canPersistAuthSession('linux', true, 'unknown')).toBe(false)
    expect(canPersistAuthSession('linux', true, 'gnome_libsecret')).toBe(true)
    expect(canPersistAuthSession('linux', true, 'kwallet6')).toBe(true)
  })
})
