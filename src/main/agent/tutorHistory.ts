import { randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { AgentRunResult, AssignmentManifest, TutorHistoryEntry } from '../../shared/contracts'
import { assignmentStorageKey, readProgress } from '../assignments/progress'
import { isSameFileIdentity, isUnchangedFile } from '../fileIdentity'

const maxHistoryBytes = 2 * 1024 * 1024
const maxHistoryEntries = 50
const historyQueues = new Map<string, Promise<void>>()

const conceptSchema = z.object({
  conceptId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  whyItMatters: z.string().min(1).max(4_000),
  mentalModel: z.string().min(1).max(4_000),
  commonMistake: z.string().min(1).max(4_000)
}).strict()

export const tutorHistoryEntrySchema = z.discriminatedUnion('mode', [
  z.object({
    id: z.uuid(), occurredAt: z.iso.datetime(), mode: z.literal('agent'),
    request: z.string().min(1).max(4_000), lessonSummary: z.string().min(1).max(4_000),
    concepts: z.array(conceptSchema).max(12)
  }).strict(),
  z.object({
    id: z.uuid(), occurredAt: z.iso.datetime(), mode: z.enum(['ask', 'plan']),
    request: z.string().min(1).max(4_000), summary: z.string().min(1).max(4_000),
    sections: z.array(z.object({ title: z.string().min(1).max(200), content: z.string().min(1).max(8_000) }).strict()).max(20),
    nextSteps: z.array(z.string().min(1).max(1_000)).max(20)
  }).strict()
])

const tutorHistorySchema = z.object({
  schemaVersion: z.literal(1),
  assignmentId: z.uuid(),
  assignmentRevision: z.string().regex(/^[a-f0-9]{64}$/),
  studentId: z.uuid(),
  entries: z.array(tutorHistoryEntrySchema).max(maxHistoryEntries)
}).strict()

function tutorHistoryPath(storageRoot: string, workspaceRoot: string, assignmentId: string): string {
  return path.join(storageRoot, `${assignmentStorageKey(workspaceRoot, assignmentId)}.tutor-history.json`)
}

async function readHistoryFile(filePath: string): Promise<unknown | null> {
  const stats = await fs.lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (!stats) return null
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Tutor history must be a regular file.')
  if (stats.size > maxHistoryBytes) return null
  const handle = await fs.open(filePath, 'r')
  try {
    const before = await handle.stat({ bigint: true })
    const pathBefore = await fs.lstat(filePath, { bigint: true })
    if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || !isSameFileIdentity(before, pathBefore)) {
      throw new Error('Tutor history changed before it could be read safely.')
    }
    const chunks: Buffer[] = []
    let total = 0
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxHistoryBytes + 1 - total))
      const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
      if (!bytesRead) break
      total += bytesRead
      if (total > maxHistoryBytes) return null
      chunks.push(chunk.subarray(0, bytesRead))
    }
    const after = await handle.stat({ bigint: true })
    const pathAfter = await fs.lstat(filePath, { bigint: true })
    if (!pathAfter.isFile() || pathAfter.isSymbolicLink() || !isUnchangedFile(before, after) || !isUnchangedFile(before, pathAfter)) {
      throw new Error('Tutor history changed while it was being read.')
    }
    return JSON.parse(Buffer.concat(chunks, total).toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  } finally {
    await handle.close()
  }
}

async function writeHistory(filePath: string, value: z.infer<typeof tutorHistorySchema>): Promise<void> {
  const entries = [...value.entries]
  let payload = ''
  do {
    payload = `${JSON.stringify({ ...value, entries }, null, 2)}\n`
    if (Buffer.byteLength(payload) <= maxHistoryBytes) break
    entries.shift()
  } while (entries.length > 0)
  if (Buffer.byteLength(payload) > maxHistoryBytes) throw new Error('The Tutor response is too large to preserve safely.')
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

async function withHistoryLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = historyQueues.get(filePath) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  historyQueues.set(filePath, current)
  await previous.catch(() => undefined)
  try {
    return await operation()
  } finally {
    release()
    if (historyQueues.get(filePath) === current) historyQueues.delete(filePath)
  }
}

export function tutorHistoryEntryFromResult(result: AgentRunResult, occurredAt = new Date().toISOString()): TutorHistoryEntry {
  return tutorHistoryEntrySchema.parse(result.mode === 'agent'
    ? { id: result.id, occurredAt, mode: result.mode, request: result.request, lessonSummary: result.lessonSummary, concepts: result.concepts }
    : { id: result.id, occurredAt, mode: result.mode, request: result.request, summary: result.summary, sections: result.sections, nextSteps: result.nextSteps })
}

export async function readTutorHistory(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string
): Promise<TutorHistoryEntry[]> {
  const progress = await readProgress(storageRoot, workspaceRoot, manifest, assignmentRevision)
  if (!progress) return []
  const raw = await readHistoryFile(tutorHistoryPath(storageRoot, workspaceRoot, manifest.id))
  if (raw === null) return []
  const parsed = tutorHistorySchema.safeParse(raw)
  if (!parsed.success) return []
  if (parsed.data.assignmentId !== manifest.id || parsed.data.assignmentRevision !== assignmentRevision || parsed.data.studentId !== progress.student.id) return []
  return parsed.data.entries
}

export async function appendTutorHistory(
  storageRoot: string,
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string,
  entry: TutorHistoryEntry
): Promise<void> {
  const progress = await readProgress(storageRoot, workspaceRoot, manifest, assignmentRevision)
  if (!progress || progress.status === 'submitted') return
  const filePath = tutorHistoryPath(storageRoot, workspaceRoot, manifest.id)
  await withHistoryLock(filePath, async () => {
    const raw = await readHistoryFile(filePath)
    const parsed = tutorHistorySchema.safeParse(raw)
    const current = parsed.success && parsed.data.assignmentId === manifest.id && parsed.data.assignmentRevision === assignmentRevision && parsed.data.studentId === progress.student.id
      ? parsed.data
      : tutorHistorySchema.parse({ schemaVersion: 1, assignmentId: manifest.id, assignmentRevision, studentId: progress.student.id, entries: [] })
    const entries = [...current.entries.filter((candidate) => candidate.id !== entry.id), tutorHistoryEntrySchema.parse(entry)].slice(-maxHistoryEntries)
    await writeHistory(filePath, { ...current, entries })
  })
}
