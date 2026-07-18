import { describe, expect, it } from 'vitest'
import { buildRenamePreview } from './renamePreview'

describe('rename preview', () => {
  it('groups worker locations into fingerprinted replacement files', () => {
    const preview = buildRenamePreview('nextName', [
      { fileName: 'file:///repo/a.ts', textSpan: { start: 6, length: 4 } },
      { fileName: 'file:///repo/a.ts', textSpan: { start: 16, length: 4 }, prefixText: 'prefix.' }
    ], new Map([['file:///repo/a.ts', {
      path: '/repo/a.ts',
      content: 'const name = 1;\nname;\n',
      fingerprint: 'a'.repeat(64)
    }]]))

    expect(preview).toHaveLength(1)
    expect(preview[0]?.edits).toEqual([
      { start: 6, end: 10, expectedText: 'name', replacement: 'nextName' },
      { start: 16, end: 20, expectedText: 'name', replacement: 'prefix.nextName' }
    ])
  })

  it('rejects locations that no longer match readable content', () => {
    expect(() => buildRenamePreview('next', [
      { fileName: 'file:///repo/a.ts', textSpan: { start: 50, length: 4 } }
    ], new Map([['file:///repo/a.ts', { path: '/repo/a.ts', content: 'short', fingerprint: 'b'.repeat(64) }]])))
      .toThrow('invalid location')
  })
})
