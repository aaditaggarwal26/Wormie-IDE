import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { collectWorkspaceFiles } from './workspaceFiles'

const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })))
})

describe('collectWorkspaceFiles', () => {
  it('skips metadata, dependencies, symbolic links, and configured exclusions', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-files-'))
    roots.push(root)
    await fs.mkdir(path.join(root, 'src'), { recursive: true })
    await fs.mkdir(path.join(root, 'node_modules', 'pkg'), { recursive: true })
    await fs.writeFile(path.join(root, 'src', 'app.ts'), '')
    await fs.writeFile(path.join(root, 'src', 'app.generated.ts'), '')
    await fs.writeFile(path.join(root, 'node_modules', 'pkg', 'index.js'), '')
    if (process.platform !== 'win32') await fs.symlink(path.join(root, 'src', 'app.ts'), path.join(root, 'linked.ts'))

    const result = await collectWorkspaceFiles(root, { excludeGlobs: ['**/*.generated.ts'], maxFiles: 20 })

    expect(result.files.map((file) => file.relativePath)).toEqual(['src/app.ts'])
    expect(result.truncated).toBe(false)
  })

  it('reports truncation without walking beyond the configured bound', async () => {
    const root = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-files-'))
    roots.push(root)
    await Promise.all(['a.ts', 'b.ts', 'c.ts'].map((name) => fs.writeFile(path.join(root, name), '')))

    const result = await collectWorkspaceFiles(root, { excludeGlobs: [], maxFiles: 2 })

    expect(result.files).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })
})
