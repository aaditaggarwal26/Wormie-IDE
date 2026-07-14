import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInside, validateEntryName } from './pathSafety'

describe('isPathInside', () => {
  const root = path.resolve('workspace')

  it('accepts the workspace and its descendants', () => {
    expect(isPathInside(root, root)).toBe(true)
    expect(isPathInside(root, path.join(root, 'src', 'index.ts'))).toBe(true)
  })

  it('rejects paths outside the workspace', () => {
    expect(isPathInside(root, path.resolve('workspace-other', 'secret.txt'))).toBe(false)
    expect(isPathInside(root, path.resolve('secret.txt'))).toBe(false)
  })
})

describe('validateEntryName', () => {
  it('accepts a portable file name', () => {
    expect(validateEntryName('  feature.ts  ')).toBe('feature.ts')
  })

  it('rejects traversal and path separators', () => {
    expect(() => validateEntryName('..')).toThrow()
    expect(() => validateEntryName('../secret')).toThrow()
    expect(() => validateEntryName('folder\\secret')).toThrow()
  })
})
