import { afterEach, describe, expect, it } from 'vitest'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { AgentGuidanceSession } from '../../shared/contracts'
import { assignmentStorageKey, startProgress } from '../assignments/progress'
import { saveAssignment } from '../assignments/storage'
import { appendTutorHistory, readTutorHistory, tutorHistoryEntryFromResult } from './tutorHistory'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

async function assignmentFixture(started = true): Promise<{
  storageRoot: string
  workspaceRoot: string
  manifest: NonNullable<Awaited<ReturnType<typeof saveAssignment>>['manifest']>
  revision: string
}> {
  const workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-tutor-workspace-'))
  const storageRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-tutor-storage-'))
  temporaryDirectories.push(workspaceRoot, storageRoot)
  await fs.writeFile(path.join(workspaceRoot, 'task.ts'), 'export {}\n')
  const assignment = await saveAssignment(workspaceRoot, {
    title: 'Tutor history', summary: 'Remember the conversation.', instructions: 'Read first.',
    tasks: [{ id: 'task', title: 'Task', description: 'Complete it.', filePath: 'task.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
    aiPolicy: { mode: 'learning-gated', passingScore: 80, allowGeneration: true },
    evidencePolicy: { includeAiActivity: false, includeFileSnapshots: false }
  })
  if (!assignment.manifest || !assignment.revision) throw new Error('Fixture assignment was not saved.')
  if (started) {
    await startProgress(storageRoot, workspaceRoot, assignment.manifest, assignment.revision, {
      workspaceRoot,
      assignmentId: assignment.manifest.id,
      assignmentRevision: assignment.revision,
      studentName: 'Ada Student',
      evidenceConsent: assignment.manifest.evidencePolicy
    })
  }
  return { storageRoot, workspaceRoot, manifest: assignment.manifest, revision: assignment.revision }
}

function guidance(id = crypto.randomUUID()): AgentGuidanceSession {
  return {
    id,
    runId: crypto.randomUUID(),
    mode: 'ask',
    request: 'How does this file work?',
    summary: 'The module exports one value.',
    sections: [{ title: 'Exports', content: 'The export is available to importers.' }],
    nextSteps: ['Open task.ts.']
  }
}

describe('assignment Tutor history', () => {
  it('does not expose Tutor history before the assignment is started', async () => {
    const fixture = await assignmentFixture(false)

    await expect(readTutorHistory(fixture.storageRoot, fixture.workspaceRoot, fixture.manifest, fixture.revision)).resolves.toEqual([])
  })

  it('restores a saved response for the same assignment and student', async () => {
    const fixture = await assignmentFixture()
    const entry = tutorHistoryEntryFromResult(guidance(), '2026-07-20T12:00:00.000Z')

    await appendTutorHistory(fixture.storageRoot, fixture.workspaceRoot, fixture.manifest, fixture.revision, entry)

    await expect(readTutorHistory(fixture.storageRoot, fixture.workspaceRoot, fixture.manifest, fixture.revision)).resolves.toEqual([entry])
  })

  it('ignores corrupt persisted history and replaces it on the next response', async () => {
    const fixture = await assignmentFixture()
    const historyPath = path.join(fixture.storageRoot, `${assignmentStorageKey(fixture.workspaceRoot, fixture.manifest.id)}.tutor-history.json`)
    await fs.writeFile(historyPath, '{broken')
    await expect(readTutorHistory(fixture.storageRoot, fixture.workspaceRoot, fixture.manifest, fixture.revision)).resolves.toEqual([])

    const entry = tutorHistoryEntryFromResult(guidance(), '2026-07-20T12:00:00.000Z')
    await appendTutorHistory(fixture.storageRoot, fixture.workspaceRoot, fixture.manifest, fixture.revision, entry)

    await expect(readTutorHistory(fixture.storageRoot, fixture.workspaceRoot, fixture.manifest, fixture.revision)).resolves.toEqual([entry])
  })

  it('keeps only the 50 most recent responses', async () => {
    const fixture = await assignmentFixture()
    const ids: string[] = []
    for (let index = 0; index < 52; index += 1) {
      const id = crypto.randomUUID()
      ids.push(id)
      await appendTutorHistory(
        fixture.storageRoot,
        fixture.workspaceRoot,
        fixture.manifest,
        fixture.revision,
        tutorHistoryEntryFromResult(guidance(id), new Date(Date.UTC(2026, 6, 20, 12, 0, index)).toISOString())
      )
    }

    const restored = await readTutorHistory(fixture.storageRoot, fixture.workspaceRoot, fixture.manifest, fixture.revision)
    expect(restored).toHaveLength(50)
    expect(restored[0]?.id).toBe(ids[2])
    expect(restored.at(-1)?.id).toBe(ids.at(-1))
  })
})
