import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendAiActivity, readAiActivity } from './activity'
import { prepareSubmittedProgress, startProgress } from './progress'
import { saveAssignment } from './storage'
import { createAssignmentSubmission, readAssignmentSubmission } from './submission'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('assignment evidence and submissions', () => {
  it('records consented AI activity and round-trips task evidence', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-submission-'))
    const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-submission-data-'))
    temporaryDirectories.push(workspace, storage)
    await fs.writeFile(path.join(workspace, 'screen.ts'), 'export const screen = true\n')
    const assignment = await saveAssignment(workspace, {
      title: 'Submission test', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'screen', title: 'Screen', description: 'Complete it.', filePath: 'screen.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'learning-gated', passingScore: 85, allowGeneration: true },
      evidencePolicy: { includeAiActivity: true, includeFileSnapshots: true }
    })
    const manifest = assignment.manifest!
    const revision = assignment.revision!
    const progress = await startProgress(storage, workspace, manifest, revision, {
      workspaceRoot: workspace,
      assignmentId: manifest.id,
      assignmentRevision: revision,
      studentName: 'Ada Student',
      evidenceConsent: manifest.evidencePolicy
    })
    await appendAiActivity(storage, workspace, manifest, revision, {
      type: 'learning', request: 'Finish the screen', concepts: ['State'], lessonSummary: 'State drives the view.'
    })
    const activity = await readAiActivity(storage, workspace, manifest, revision)
    const completedProgress = {
      ...progress,
      tasks: { ...progress.tasks, screen: { ...progress.tasks.screen, status: 'completed' as const, completedAt: new Date().toISOString() } }
    }
    const submitted = prepareSubmittedProgress(completedProgress, new Date().toISOString())
    const result = await createAssignmentSubmission(workspace, manifest, revision, submitted, activity)
    const submissionPath = path.join(workspace, 'student.wormie-submission.json')
    await fs.writeFile(submissionPath, result.payload)

    const opened = await readAssignmentSubmission(submissionPath, manifest, revision)
    expect(opened.student.name).toBe('Ada Student')
    expect(opened.aiActivity).toHaveLength(1)
    expect(Buffer.from(opened.files[0].contentBase64, 'base64').toString('utf8')).toContain('screen = true')
  })

  it('rejects tampered task evidence', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-submission-'))
    const storage = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-submission-data-'))
    temporaryDirectories.push(workspace, storage)
    await fs.writeFile(path.join(workspace, 'task.ts'), 'export {}\n')
    const assignment = await saveAssignment(workspace, {
      title: 'Tamper test', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'task', title: 'Task', description: 'Complete it.', filePath: 'task.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'disabled', passingScore: 80, allowGeneration: false },
      evidencePolicy: { includeAiActivity: false, includeFileSnapshots: true }
    })
    const manifest = assignment.manifest!
    const revision = assignment.revision!
    const started = await startProgress(storage, workspace, manifest, revision, {
      workspaceRoot: workspace, assignmentId: manifest.id, assignmentRevision: revision,
      studentName: 'Ada Student', evidenceConsent: manifest.evidencePolicy
    })
    const completed = prepareSubmittedProgress({
      ...started,
      tasks: { task: { ...started.tasks.task, status: 'completed', completedAt: new Date().toISOString() } }
    }, new Date().toISOString())
    const result = await createAssignmentSubmission(workspace, manifest, revision, completed, [])
    const value = JSON.parse(result.payload)
    value.files[0].contentBase64 = Buffer.from('tampered').toString('base64')
    const submissionPath = path.join(workspace, 'tampered.wormie-submission.json')
    await fs.writeFile(submissionPath, JSON.stringify(value))

    await expect(readAssignmentSubmission(submissionPath, manifest, revision)).rejects.toThrow('integrity check')
  })
})
