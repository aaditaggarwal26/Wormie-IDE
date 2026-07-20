import { describe, expect, it } from 'vitest'
import { selectTypeScriptProjectFiles } from './projectFiles'

describe('TypeScript project files', () => {
  it('selects JavaScript and TypeScript sources within the configured bound', () => {
    const files = [
      { path: '/repo/a.ts', relativePath: 'a.ts', name: 'a.ts' },
      { path: '/repo/b.tsx', relativePath: 'b.tsx', name: 'b.tsx' },
      { path: '/repo/c.json', relativePath: 'c.json', name: 'c.json' },
      { path: '/repo/d.js', relativePath: 'd.js', name: 'd.js' }
    ]
    expect(selectTypeScriptProjectFiles(files, 2).map((file) => file.name)).toEqual(['a.ts', 'b.tsx'])
  })
})
