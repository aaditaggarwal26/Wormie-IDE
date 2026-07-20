import { describe, expect, it } from 'vitest'
import { validateWatchFilePaths } from './fileWatchPolicy'

describe('file watch policy', () => {
  it('rejects malformed and oversized watch lists', () => {
    expect(() => validateWatchFilePaths('file.ts')).toThrow()
    expect(() => validateWatchFilePaths([''])).toThrow()
    expect(() => validateWatchFilePaths(Array.from({ length: 31 }, (_, index) => `${index}.ts`))).toThrow()
  })

  it('deduplicates valid paths', () => {
    expect(validateWatchFilePaths(['/repo/a.ts', '/repo/a.ts'])).toEqual(['/repo/a.ts'])
  })
})
