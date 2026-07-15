import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type {
  AssignmentManifest,
  AssignmentProgress,
  AssignmentStartRequest,
  AssignmentTaskProgressRequest
} from '../../shared/contracts'

const maxProgressBytes = 1024 * 1024
const progressQueues = new Map<string, Promise<void>>()

const taskProgressSchema = z.object({
  status: z.enum(['not-started', 'in-progress', 'completed']),
  notes: z.string().max(4_000),
  updatedAt: z.iso.datetime(),
  completedAt: z.iso.datetime().optional()
}).strict()

export const assignmentProgressSchema = z.object({
  schemaVersion: z.literal(1),
  revision: z.uuid(),
  assignmentId: z.uuid(),
  assignmentRevision: z.string().regex(/^[a-f0-9]{64}$/),
  student: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(100) }).strict(),
  startedAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  status: z.enum(['in-progress', 'submitted']),
  evidenceConsent: z.object({
    includeAiActivity: z.boolean(),
    includeFileSnapshots: z.boolean(),
    acceptedAt: z.iso.datetime()
  }).strict(),
  tasks: z.record(z.string(), taskProgressSchema)
}).strict()

export function assignmentStorageKey(workspaceRoot: string, assignmentId: string): string {
  const root = process.platform === 'win32' ? path.resolve(workspaceRoot).toLowerCase() : path.resolve(workspaceRoot)
  return createHash('sha256').update(`${root}\0${assignmentId}`).digest('hex')
}

function progressPath(storageRoot: string, workspaceRoot: string, assignmentId: string): string {
  return path.join(storageRoot, `${assignmentStorageKey(workspaceRoot, assignmentId)}.json`)
}

async function readBoundedJson(filePath: string): Promise<unknown | null> {
  const pathStats = await fs.lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!pathStats) return null
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) throw new Error('Assignment progress must be a regular file.')
  if (pathStats.size > maxProgressBytes) throw new Error('Assignment progress is larger than 1 MB.')
  const handle = await fs.open(filePath, 'r')
  try {
    const before = await handle.stat({ bigint: true })
    const chunks: Buffer[] = []
    let total = 0
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxProgressBytes + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (!bytesRead) break
      total += bytesRead
      if (total > maxProgressBytes) throw new Error('Assignment progress is larger than 1 MB.')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    const after = await handle.stat({ bigint: true })
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new Error('Assignment progress changed while it was being read.')
    }
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('Assignment progress contains invalid JSON.')
    throw error
  } finally {
    await handle.close()
  }
}

async function writeProgress(
  storageRoot: string,
  workspaceRoot: string,
  progress: AssignmentProgress
): Promise<void> {
  const filePath = progressPath(storageRoot, workspaceRoot, progress.assignmentId)
  const payload = `${JSON.stringify(progress, null, 2)}\n`
  if (Buffer.byteLength(payload) > maxProgressBytes) throw new Error('Assignment progress is larger than 1 MB.')
  await fs.mkdir(storageRoot, { recursive: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  const handle = await fs.open(temporaryPath, 'wx')
  try {
    await handle.writeFile(payload, 'utf8')
    await handle.sync()
  } finally {
    await handle.close()
  }
  try {
    await fs.rename(temporaryPath, filePath)
  } catch (error) {
    await fs.unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function withProgressLock<T>(storageRoot: string, workspaceRoot: string, assignmentId: string, operation: () => Promise<T>): Promise<T> {
  const key = progressPath(storageRoot, workspaceRoot, assignmentId)
  const previous = progressQueues.get(key) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  progressQueues.set(key, current)
  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (progressQueues.get(key) === current) progressQueues.delete(key)
  }
}

export async function readProgress(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string
): Promise<AssignmentProgress | null> {
  const value = await readBoundedJson(progressPath(storageRoot, workspaceRoot, manifest.id))
  if (value === null) return null
  const result = assignmentProgressSchema.safeParse(value)
  if (!result.success) throw new Error(`Assignment progress is invalid: ${result.error.issues[0]?.message ?? 'Unknown validation error.'}`)
  if (result.data.assignmentId !== manifest.id) throw new Error('Assignment progress belongs to a different assignment.')
  if (result.data.assignmentRevision !== assignmentRevision) {
    throw new Error('The assignment changed after this student started. Restore the assigned manifest or restart the assignment.')
  }
  const progressTaskIds = Object.keys(result.data.tasks).sort()
  const manifestTaskIds = manifest.tasks.map((task) => task.id).sort()
  if (JSON.stringify(progressTaskIds) !== JSON.stringify(manifestTaskIds)) {
    throw new Error('The assignment tasks changed after this student started.')
  }
  return result.data
}

async function startProgressUnlocked(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string,
  request: AssignmentStartRequest
): Promise<AssignmentProgress> {
  if (await readProgress(storageRoot, workspaceRoot, manifest, assignmentRevision)) throw new Error('This assignment has already been started in this workspace.')
  const studentName = typeof request.studentName === 'string' ? request.studentName.trim() : ''
  if (!studentName || studentName.length > 100 || /[\0\r\n]/.test(studentName)) throw new Error('Enter a student name between 1 and 100 characters.')
  if (
    request.evidenceConsent?.includeAiActivity !== manifest.evidencePolicy.includeAiActivity ||
    request.evidenceConsent?.includeFileSnapshots !== manifest.evidencePolicy.includeFileSnapshots
  ) throw new Error('Consent must match the evidence requested by this assignment.')
  const now = new Date().toISOString()
  const tasks = Object.fromEntries(manifest.tasks.map((task) => [task.id, {
    status: 'not-started' as const,
    notes: '',
    updatedAt: now
  }]))
  const progress = assignmentProgressSchema.parse({
    schemaVersion: 1,
    revision: randomUUID(),
    assignmentId: manifest.id,
    assignmentRevision,
    student: { id: randomUUID(), name: studentName },
    startedAt: now,
    updatedAt: now,
    status: 'in-progress',
    evidenceConsent: { ...request.evidenceConsent, acceptedAt: now },
    tasks
  })
  await writeProgress(storageRoot, workspaceRoot, progress)
  return progress
}

async function updateTaskProgressUnlocked(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string,
  request: AssignmentTaskProgressRequest
): Promise<AssignmentProgress> {
  const progress = await readProgress(storageRoot, workspaceRoot, manifest, assignmentRevision)
  if (!progress) throw new Error('Start the assignment before updating a task.')
  if (progress.status === 'submitted') throw new Error('This assignment has already been submitted.')
  if (request.expectedProgressRevision !== progress.revision) throw new Error('Progress changed since it was loaded. Reload the assignment and try again.')
  const rawUpdate = request.update
  if (!rawUpdate || !manifest.tasks.some((task) => task.id === rawUpdate.taskId)) throw new Error('Choose a valid assignment task.')
  if (!['not-started', 'in-progress', 'completed'].includes(rawUpdate.status)) throw new Error('Choose a valid task status.')
  const notes = typeof rawUpdate.notes === 'string' ? rawUpdate.notes.trim() : ''
  if (notes.length > 4_000) throw new Error('Task notes are limited to 4,000 characters.')
  const now = new Date().toISOString()
  const updated = assignmentProgressSchema.parse({
    ...progress,
    revision: randomUUID(),
    updatedAt: now,
    tasks: {
      ...progress.tasks,
      [rawUpdate.taskId]: {
        status: rawUpdate.status,
        notes,
        updatedAt: now,
        ...(rawUpdate.status === 'completed' ? { completedAt: progress.tasks[rawUpdate.taskId].completedAt ?? now } : {})
      }
    }
  })
  await writeProgress(storageRoot, workspaceRoot, updated)
  return updated
}

export function prepareSubmittedProgress(progress: AssignmentProgress, submittedAt: string): AssignmentProgress {
  if (progress.status === 'submitted') throw new Error('This assignment has already been submitted.')
  return assignmentProgressSchema.parse({ ...progress, revision: randomUUID(), updatedAt: submittedAt, status: 'submitted' })
}

export async function commitSubmittedProgress(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string,
  expectedProgressRevision: string,
  submitted: AssignmentProgress
): Promise<AssignmentProgress> {
  return withProgressLock(storageRoot, workspaceRoot, manifest.id, async () => {
    const progress = await readProgress(storageRoot, workspaceRoot, manifest, assignmentRevision)
    if (!progress) throw new Error('Start the assignment before submitting it.')
    if (progress.status === 'submitted') throw new Error('This assignment has already been submitted.')
    if (progress.revision !== expectedProgressRevision) throw new Error('Progress changed since it was loaded. Reload the assignment and try again.')
    if (submitted.assignmentId !== manifest.id || submitted.assignmentRevision !== assignmentRevision || submitted.status !== 'submitted') {
      throw new Error('The prepared submission progress is invalid.')
    }
    assignmentProgressSchema.parse(submitted)
    await writeProgress(storageRoot, workspaceRoot, submitted)
    return submitted
  })
}

export function startProgress(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string,
  request: AssignmentStartRequest
): Promise<AssignmentProgress> {
  return withProgressLock(storageRoot, workspaceRoot, manifest.id, () => startProgressUnlocked(storageRoot, workspaceRoot, manifest, assignmentRevision, request))
}

export function updateTaskProgress(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string,
  request: AssignmentTaskProgressRequest
): Promise<AssignmentProgress> {
  return withProgressLock(storageRoot, workspaceRoot, manifest.id, () => updateTaskProgressUnlocked(storageRoot, workspaceRoot, manifest, assignmentRevision, request))
}
