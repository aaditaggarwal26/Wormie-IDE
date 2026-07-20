import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { AssignmentAiActivity, AssignmentManifest } from '../../shared/contracts'
import { assignmentStorageKey, readProgress } from './progress'

const maxActivityBytes = 2 * 1024 * 1024
const maxEvents = 2_000
const activityQueues = new Map<string, Promise<void>>()

export const assignmentAiActivitySchema = z.discriminatedUnion('type', [
  z.object({ id: z.uuid(), occurredAt: z.iso.datetime(), type: z.literal('learning'), request: z.string().max(4_000), concepts: z.array(z.string().max(200)).max(10), lessonSummary: z.string().max(4_000) }).strict(),
  z.object({ id: z.uuid(), occurredAt: z.iso.datetime(), type: z.literal('quiz'), sessionId: z.uuid(), score: z.number().min(0).max(100), passed: z.boolean() }).strict(),
  z.object({ id: z.uuid(), occurredAt: z.iso.datetime(), type: z.literal('proposal'), sessionId: z.uuid(), proposalId: z.uuid(), summary: z.string().max(4_000), paths: z.array(z.string().max(500)).max(100) }).strict(),
  z.object({ id: z.uuid(), occurredAt: z.iso.datetime(), type: z.literal('apply'), proposalId: z.uuid(), applied: z.boolean(), paths: z.array(z.string().max(500)).max(100) }).strict()
])

const activitySchema = z.object({
  schemaVersion: z.literal(1),
  assignmentId: z.uuid(),
  assignmentRevision: z.string().regex(/^[a-f0-9]{64}$/),
  studentId: z.uuid(),
  events: z.array(assignmentAiActivitySchema).max(maxEvents)
}).strict()

export type AssignmentAiActivityInput =
  | { type: 'learning'; request: string; concepts: string[]; lessonSummary: string }
  | { type: 'quiz'; sessionId: string; score: number; passed: boolean }
  | { type: 'proposal'; sessionId: string; proposalId: string; summary: string; paths: string[] }
  | { type: 'apply'; proposalId: string; applied: boolean; paths: string[] }

function activityPath(storageRoot: string, workspaceRoot: string, assignmentId: string): string {
  return path.join(storageRoot, `${assignmentStorageKey(workspaceRoot, assignmentId)}.activity.json`)
}

async function readActivityFile(filePath: string): Promise<unknown | null> {
  const stats = await fs.lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!stats) return null
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('AI activity evidence must be a regular file.')
  if (stats.size > maxActivityBytes) throw new Error('AI activity evidence is larger than 2 MB.')
  const handle = await fs.open(filePath, 'r')
  try {
    const before = await handle.stat({ bigint: true })
    const chunks: Buffer[] = []
    let total = 0
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxActivityBytes + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (!bytesRead) break
      total += bytesRead
      if (total > maxActivityBytes) throw new Error('AI activity evidence is larger than 2 MB.')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    const after = await handle.stat({ bigint: true })
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs) {
      throw new Error('AI activity evidence changed while it was being read.')
    }
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('AI activity evidence contains invalid JSON.')
    throw error
  } finally {
    await handle.close()
  }
}

async function writeActivity(filePath: string, value: unknown): Promise<void> {
  const payload = `${JSON.stringify(value, null, 2)}\n`
  if (Buffer.byteLength(payload) > maxActivityBytes) throw new Error('AI activity evidence is larger than 2 MB.')
  await fs.mkdir(path.dirname(filePath), { recursive: true })
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

async function withActivityLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = activityQueues.get(filePath) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  activityQueues.set(filePath, current)
  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (activityQueues.get(filePath) === current) activityQueues.delete(filePath)
  }
}

export async function readAiActivity(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string
): Promise<AssignmentAiActivity[]> {
  const raw = await readActivityFile(activityPath(storageRoot, workspaceRoot, manifest.id))
  if (raw === null) return []
  const parsed = activitySchema.safeParse(raw)
  if (!parsed.success) throw new Error(`AI activity evidence is invalid: ${parsed.error.issues[0]?.message ?? 'Unknown validation error.'}`)
  if (parsed.data.assignmentId !== manifest.id || parsed.data.assignmentRevision !== assignmentRevision) {
    throw new Error('AI activity evidence belongs to a different assignment revision.')
  }
  const progress = await readProgress(storageRoot, workspaceRoot, manifest, assignmentRevision)
  if (!progress || !progress.evidenceConsent.includeAiActivity) return []
  if (parsed.data.studentId !== progress.student.id) throw new Error('AI activity evidence belongs to a different student.')
  return parsed.data.events
}

export async function appendAiActivity(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string,
  input: AssignmentAiActivityInput
): Promise<boolean> {
  const progress = await readProgress(storageRoot, workspaceRoot, manifest, assignmentRevision)
  if (!progress) return false
  if (progress.status === 'submitted') throw new Error('This assignment has already been submitted.')
  if (!progress.evidenceConsent.includeAiActivity) return false
  const filePath = activityPath(storageRoot, workspaceRoot, manifest.id)
  await withActivityLock(filePath, async () => {
    const raw = await readActivityFile(filePath)
    const current = raw === null
      ? activitySchema.parse({ schemaVersion: 1, assignmentId: manifest.id, assignmentRevision, studentId: progress.student.id, events: [] })
      : activitySchema.parse(raw)
    if (current.assignmentId !== manifest.id || current.assignmentRevision !== assignmentRevision || current.studentId !== progress.student.id) {
      throw new Error('AI activity evidence does not match the active student assignment.')
    }
    if (current.events.length >= maxEvents) throw new Error('AI activity evidence reached its 2,000 event limit.')
    const event = assignmentAiActivitySchema.parse({ ...input, id: randomUUID(), occurredAt: new Date().toISOString() })
    await writeActivity(filePath, { ...current, events: [...current.events, event] })
  })
  return true
}
