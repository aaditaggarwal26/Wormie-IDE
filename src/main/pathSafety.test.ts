import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInside } from './pathSafety'

describe('workspace path safety', () => {
  it('accepts descendants and rejects sibling-prefix and parent paths', () => {
    const root = path.resolve('workspace')
    expect(isPathInside(root, path.join(root, 'src', 'file.ts'))).toBe(true)
    expect(isPathInside(root, path.resolve('workspace-copy', 'file.ts'))).toBe(false)
    expect(isPathInside(root, path.resolve('outside.ts'))).toBe(false)
  })
})
