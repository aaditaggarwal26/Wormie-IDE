import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AssignmentManifestDraft } from '../../shared/contracts'
import { readProgress, startProgress, updateTaskProgress } from './progress'
import { saveAssignment } from './storage'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('assignment progress', () => {
  it('starts and updates durable student task progress', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-progress-'))
    const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-progress-data-'))
    temporaryDirectories.push(workspace, storage)
    await fs.writeFile(path.join(workspace, 'screen.ts'), 'export {}\n')
    const draft: AssignmentManifestDraft = {
      title: 'Progress test', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'screen', title: 'Screen', description: 'Complete it.', filePath: 'screen.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'learning-gated', passingScore: 80, allowGeneration: true },
      evidencePolicy: { includeAiActivity: true, includeFileSnapshots: true }
    }
    const assignment = await saveAssignment(workspace, draft)
    const manifest = assignment.manifest!
    const revision = assignment.revision!
    const started = await startProgress(storage, workspace, manifest, revision, {
      workspaceRoot: workspace,
      assignmentId: manifest.id,
      assignmentRevision: revision,
      studentName: 'Ada Student',
      evidenceConsent: manifest.evidencePolicy
    })
    expect(started.tasks.screen.status).toBe('not-started')

    const updated = await updateTaskProgress(storage, workspace, manifest, revision, {
      workspaceRoot: workspace,
      assignmentId: manifest.id,
      assignmentRevision: revision,
      expectedProgressRevision: started.revision,
      update: { taskId: 'screen', status: 'completed', notes: 'Verified locally.' }
    })
    expect(updated.tasks.screen.status).toBe('completed')
    expect(updated.tasks.screen.completedAt).toBeTruthy()
    expect(await readProgress(storage, workspace, manifest, revision)).toEqual(updated)
    await expect(fs.access(path.join(workspace, '.wormie', 'progress.json'))).rejects.toThrow()
    await expect(updateTaskProgress(storage, workspace, manifest, revision, {
      workspaceRoot: workspace,
      assignmentId: manifest.id,
      assignmentRevision: revision,
      expectedProgressRevision: started.revision,
      update: { taskId: 'screen', status: 'in-progress', notes: '' }
    })).rejects.toThrow('Progress changed')
  })

  it('does not start the same local assignment twice', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-progress-'))
    const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-progress-data-'))
    temporaryDirectories.push(workspace, storage)
    await fs.writeFile(path.join(workspace, 'screen.ts'), 'export {}\n')
    const assignment = await saveAssignment(workspace, {
      title: 'Progress test', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'screen', title: 'Screen', description: 'Complete it.', filePath: 'screen.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'disabled', passingScore: 80, allowGeneration: false },
      evidencePolicy: { includeAiActivity: false, includeFileSnapshots: true }
    })
    const manifest = assignment.manifest!
    const request = {
      workspaceRoot: workspace,
      assignmentId: manifest.id,
      assignmentRevision: assignment.revision!,
      studentName: 'Ada Student',
      evidenceConsent: manifest.evidencePolicy
    }
    await startProgress(storage, workspace, manifest, assignment.revision!, request)
    await expect(startProgress(storage, workspace, manifest, assignment.revision!, { ...request, studentName: 'Another Student' })).rejects.toThrow('already been started')
  })
})
