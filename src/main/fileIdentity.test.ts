import { describe, expect, it } from 'vitest'
import { isSameFileIdentity, isUnchangedFile } from './fileIdentity'

describe('file identity', () => {
  it('uses the stable Windows file ID when handle and path device IDs differ', () => {
    expect(isSameFileIdentity({ dev: 1716578109n, ino: 44n }, { dev: 0n, ino: 44n }, 'win32')).toBe(true)
    expect(isSameFileIdentity({ dev: 1716578109n, ino: 44n }, { dev: 0n, ino: 45n }, 'win32')).toBe(false)
  })

  it('requires device and inode identity on POSIX platforms', () => {
    expect(isSameFileIdentity({ dev: 7n, ino: 44n }, { dev: 7n, ino: 44n }, 'linux')).toBe(true)
    expect(isSameFileIdentity({ dev: 7n, ino: 44n }, { dev: 8n, ino: 44n }, 'linux')).toBe(false)
  })

  it('also detects content metadata changes while accepting Windows device variance', () => {
    const before = { dev: 12n, ino: 44n, size: 10n, mtimeNs: 20n, ctimeNs: 30n }
    expect(isUnchangedFile(before, { ...before, dev: 0n }, 'win32')).toBe(true)
    expect(isUnchangedFile(before, { ...before, dev: 0n, size: 11n }, 'win32')).toBe(false)
    expect(isUnchangedFile(before, { ...before, dev: 0n, mtimeNs: 21n }, 'win32')).toBe(false)
  })
})
