import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AssignmentManifestDraft } from '../../shared/contracts'
import { readAssignment, readAssignmentRevision, saveAssignment } from './storage'

const temporaryDirectories: string[] = []

async function createWorkspace(): Promise<string> {
  const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-assignment-'))
  temporaryDirectories.push(workspace)
  await fs.mkdir(path.join(workspace, 'src'))
  await fs.writeFile(path.join(workspace, 'src', 'screen.tsx'), 'export function Screen() {}\n')
  return workspace
}

function draft(overrides: Partial<AssignmentManifestDraft> = {}): AssignmentManifestDraft {
  return {
    title: 'Complete the profile screen',
    summary: 'Build the final screen in the starter mobile application.',
    instructions: 'Read the existing screens before implementing the profile screen.',
    tasks: [{
      id: 'profile-screen',
      title: 'Implement profile screen',
      description: 'Complete the provided profile screen component.',
      filePath: 'src/screen.tsx',
      kind: 'implement',
      acceptanceCriteria: ['The screen renders the student profile.']
    }],
    aiPolicy: { mode: 'learning-gated', passingScore: 80, allowGeneration: true },
    evidencePolicy: { includeAiActivity: true, includeFileSnapshots: true },
    ...overrides
  }
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('assignment storage', () => {
  it('creates and reads a versioned assignment manifest', async () => {
    const workspace = await createWorkspace()
    const saved = await saveAssignment(workspace, draft())
    const loaded = await readAssignment(workspace)

    expect(saved.manifest?.schemaVersion).toBe(1)
    expect(saved.manifest?.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(loaded).toEqual(saved)
  })

  it('preserves identity and creation time when updating an assignment', async () => {
    const workspace = await createWorkspace()
    const first = await saveAssignment(workspace, draft())
    const second = await saveAssignment(workspace, draft({ id: first.manifest?.id, title: 'Updated title' }), first.revision)

    expect(second.manifest?.id).toBe(first.manifest?.id)
    expect(second.manifest?.createdAt).toBe(first.manifest?.createdAt)
    expect(second.manifest?.title).toBe('Updated title')
  })

  it('rejects traversal and protected task paths', async () => {
    const workspace = await createWorkspace()

    await expect(saveAssignment(workspace, draft({
      tasks: [{ ...draft().tasks[0], filePath: '../outside.ts' }]
    }))).rejects.toThrow()
    await expect(saveAssignment(workspace, draft({
      tasks: [{ ...draft().tasks[0], filePath: '.git/config' }]
    }))).rejects.toThrow()
  })

  it('requires existing files except for create tasks', async () => {
    const workspace = await createWorkspace()
    const missingTask = { ...draft().tasks[0], filePath: 'src/missing.tsx' }

    await expect(saveAssignment(workspace, draft({ tasks: [missingTask] }))).rejects.toThrow('does not exist')
    await expect(saveAssignment(workspace, draft({ tasks: [{ ...missingTask, kind: 'create' }] }))).resolves.toBeTruthy()
  })

  it('rejects oversized saves without poisoning the workspace', async () => {
    const workspace = await createWorkspace()
    const tasks = Array.from({ length: 50 }, (_, index) => ({
      id: `create-${index}`,
      title: `Create file ${index}`,
      description: 'd'.repeat(4_000),
      filePath: `src/create-${index}.ts`,
      kind: 'create' as const,
      acceptanceCriteria: Array.from({ length: 20 }, () => 'a'.repeat(500))
    }))

    await expect(saveAssignment(workspace, draft({ tasks }))).rejects.toThrow('larger than 256 KB')
    await expect(readAssignment(workspace)).resolves.toEqual({ workspaceRoot: workspace, role: 'teacher', manifest: null, manifestPath: null, revision: null, progress: null })
  })

  it('rejects a concurrent save that was based on a stale revision', async () => {
    const workspace = await createWorkspace()
    const results = await Promise.allSettled([
      saveAssignment(workspace, draft({ title: 'First title' })),
      saveAssignment(workspace, draft({ title: 'Second title' }))
    ])
    const loaded = await readAssignment(workspace)

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1)
    expect(loaded.manifest?.title).toBe('First title')
  })

  it('backs up and replaces an invalid manifest only through recovery', async () => {
    const workspace = await createWorkspace()
    const assignmentDirectory = path.join(workspace, '.wormie')
    await fs.mkdir(assignmentDirectory)
    await fs.writeFile(path.join(assignmentDirectory, 'assignment.json'), '{broken')

    await expect(saveAssignment(workspace, draft(), null)).rejects.toThrow('invalid JSON')
    const invalidRevision = await readAssignmentRevision(workspace)
    const recovered = await saveAssignment(workspace, draft(), invalidRevision, true)
    const files = await fs.readdir(assignmentDirectory)
    expect(recovered.manifest?.title).toBe(draft().title)
    expect(files.some((file) => file.startsWith('assignment.invalid-'))).toBe(true)
  })

  it('rejects recovery when the invalid manifest changed after loading', async () => {
    const workspace = await createWorkspace()
    const assignmentDirectory = path.join(workspace, '.wormie')
    await fs.mkdir(assignmentDirectory)
    const manifestPath = path.join(assignmentDirectory, 'assignment.json')
    await fs.writeFile(manifestPath, '{broken')
    const staleRevision = await readAssignmentRevision(workspace)
    await fs.writeFile(manifestPath, '{different broken')

    await expect(saveAssignment(workspace, draft(), staleRevision, true)).rejects.toThrow('changed outside this editor')
  })

  it('continues the save queue after a rejected save', async () => {
    const workspace = await createWorkspace()
    await expect(saveAssignment(workspace, draft({
      tasks: [{ ...draft().tasks[0], filePath: 'src/missing.ts' }]
    }))).rejects.toThrow('does not exist')
    await expect(saveAssignment(workspace, draft({ title: 'Recovered' }))).resolves.toMatchObject({
      manifest: { title: 'Recovered' }
    })
  })

  it('rejects Windows drive-relative and non-portable names', async () => {
    const workspace = await createWorkspace()
    for (const filePath of ['C:escape.ts', 'src/value:stream', 'src/CON.ts', 'src/trailing.', `src/${'a'.repeat(241)}.ts`]) {
      await expect(saveAssignment(workspace, draft({
        tasks: [{ ...draft().tasks[0], filePath, kind: 'create' }]
      }))).rejects.toThrow()
    }
  })

  it('rejects create tasks and loaded manifests that leave through junctions', async () => {
    const workspace = await createWorkspace()
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-outside-'))
    temporaryDirectories.push(outside)
    await fs.writeFile(path.join(outside, 'outside.ts'), 'export {}\n')
    await fs.symlink(outside, path.join(workspace, 'link'), 'junction')

    await expect(saveAssignment(workspace, draft({
      tasks: [{ ...draft().tasks[0], filePath: 'link/new.ts', kind: 'create' }]
    }))).rejects.toThrow('outside or missing')

    const valid = await saveAssignment(workspace, draft())
    const unsafe = {
      ...valid.manifest,
      tasks: [{ ...valid.manifest!.tasks[0], filePath: 'link/outside.ts' }]
    }
    await fs.writeFile(path.join(workspace, '.wormie', 'assignment.json'), `${JSON.stringify(unsafe)}\n`)
    await expect(readAssignment(workspace)).rejects.toThrow('leaves the workspace')
  })

  it('rejects existing create targets that link outside the workspace', async () => {
    const workspace = await createWorkspace()
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-outside-file-'))
    temporaryDirectories.push(outside)
    await fs.symlink(outside, path.join(workspace, 'src', 'linked.ts'), 'junction')

    await expect(saveAssignment(workspace, draft({
      tasks: [{ ...draft().tasks[0], filePath: 'src/linked.ts', kind: 'create' }]
    }))).rejects.toThrow('cannot be a symbolic link')
  })

  it('rejects broken task links instead of treating them as missing files', async () => {
    const workspace = await createWorkspace()
    const missingTarget = path.join(os.tmpdir(), `wormie-missing-${Date.now()}`)
    await fs.symlink(missingTarget, path.join(workspace, 'src', 'broken.ts'), 'junction')

    await expect(saveAssignment(workspace, draft({
      tasks: [{ ...draft().tasks[0], filePath: 'src/broken.ts', kind: 'create' }]
    }))).rejects.toThrow('cannot be a symbolic link')
  })

  it('rejects malformed and oversized manifests', async () => {
    const workspace = await createWorkspace()
    const assignmentDirectory = path.join(workspace, '.wormie')
    await fs.mkdir(assignmentDirectory)
    await fs.writeFile(path.join(assignmentDirectory, 'assignment.json'), '{bad json')
    await expect(readAssignment(workspace)).rejects.toThrow('invalid JSON')

    await fs.writeFile(path.join(assignmentDirectory, 'assignment.json'), 'x'.repeat(256 * 1024 + 1))
    await expect(readAssignment(workspace)).rejects.toThrow('larger than 256 KB')
    await expect(readAssignmentRevision(workspace)).rejects.toThrow('cannot be recovered automatically')
  })
})
