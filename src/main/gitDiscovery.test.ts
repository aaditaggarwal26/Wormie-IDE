import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findGitRepositories } from './gitDiscovery'

describe('findGitRepositories', () => {
  let temporaryRoot: string

  beforeEach(async () => {
    temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-git-'))
  })

  afterEach(async () => {
    await fs.rm(temporaryRoot, { force: true, recursive: true })
  })

  it('detects a repository at the workspace root', async () => {
    await fs.mkdir(path.join(temporaryRoot, '.git'))
    await expect(findGitRepositories(temporaryRoot)).resolves.toEqual([temporaryRoot])
  })

  it('detects repositories nested under the workspace root', async () => {
    const firstRepository = path.join(temporaryRoot, 'apps', 'web')
    const secondRepository = path.join(temporaryRoot, 'services', 'api')
    await fs.mkdir(path.join(firstRepository, '.git'), { recursive: true })
    await fs.mkdir(path.join(secondRepository, '.git'), { recursive: true })

    const repositories = await findGitRepositories(temporaryRoot)
    expect(repositories.sort()).toEqual([firstRepository, secondRepository].sort())
  })
})
