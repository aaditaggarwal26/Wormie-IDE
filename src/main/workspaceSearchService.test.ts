import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { SearchOptions, WorkspaceFileEntry } from '../shared/contracts'
import { searchWorkspaceFiles, validateSearchOptions, writeReplacementFile } from './workspaceSearchService'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

function options(overrides: Partial<SearchOptions> = {}): SearchOptions {
  return {
    requestId: 'request-1',
    query: 'needle',
    replacement: 'thread',
    caseSensitive: false,
    wholeWord: false,
    useRegex: false,
    includeGlobs: [],
    excludeGlobs: [],
    folderPath: null,
    ...overrides
  }
}

describe('workspace search service', () => {
  it('filters globs, rejects binary text, and groups matches by file', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-search-'))
    roots.push(root)
    const paths = {
      source: path.join(root, 'source.ts'),
      test: path.join(root, 'source.test.ts'),
      binary: path.join(root, 'binary.ts')
    }
    await fs.writeFile(paths.source, 'needle\nneedle')
    await fs.writeFile(paths.test, 'needle')
    await fs.writeFile(paths.binary, 'needle\0binary')
    const files: WorkspaceFileEntry[] = [
      { path: paths.source, relativePath: 'source.ts', name: 'source.ts' },
      { path: paths.test, relativePath: 'source.test.ts', name: 'source.test.ts' },
      { path: paths.binary, relativePath: 'binary.ts', name: 'binary.ts' }
    ]

    const result = await searchWorkspaceFiles(root, files, options({ includeGlobs: ['**/*.ts'], excludeGlobs: ['**/*.test.ts'] }), () => false)

    expect(result.files.map((file) => file.relativePath)).toEqual(['source.ts'])
    expect(result.totalMatches).toBe(2)
    expect(result.files[0]?.matches[0]?.replacement).toBe('thread')
  })

  it('stops obsolete searches without applying later files', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-search-'))
    roots.push(root)
    const filePath = path.join(root, 'source.ts')
    await fs.writeFile(filePath, 'needle')

    const result = await searchWorkspaceFiles(root, [{ path: filePath, relativePath: 'source.ts', name: 'source.ts' }], options(), () => true)

    expect(result.files).toEqual([])
  })

  it('validates malformed requests and writes replacement files atomically', async () => {
    expect(() => validateSearchOptions({ ...options(), includeGlobs: 'not-an-array' })).toThrow('globs')
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-search-'))
    roots.push(root)
    const filePath = path.join(root, 'source.ts')
    await fs.writeFile(filePath, 'before')
    const stats = await fs.stat(filePath)

    await writeReplacementFile(filePath, 'after', stats.mode)

    expect(await fs.readFile(filePath, 'utf8')).toBe('after')
    expect((await fs.readdir(root)).filter((name) => name.includes('.wormie-'))).toEqual([])
  })
})
