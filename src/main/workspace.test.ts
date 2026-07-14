import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isPathInside } from './pathSafety'

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
