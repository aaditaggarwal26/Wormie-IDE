import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import type { BigIntStats } from 'node:fs'
import type {
  AssignmentAiActivity,
  AssignmentManifest,
  AssignmentProgress,
  AssignmentSubmission,
  AssignmentSubmissionFile
} from '../../shared/contracts'
import { isPathInside } from '../pathSafety'
import { assignmentAiActivitySchema } from './activity'
import { assignmentProgressSchema } from './progress'
import { portableWorkspacePathSchema } from './schema'

const maxSnapshotBytes = 2 * 1024 * 1024
const maxSubmissionFileBytes = 10 * 1024 * 1024
const maxSubmissionJsonBytes = 16 * 1024 * 1024

const submissionFileSchema = z.object({
  path: portableWorkspacePathSchema,
  contentBase64: z.string().max(3_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(0).max(maxSnapshotBytes)
}).strict()

export const assignmentSubmissionSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  assignmentId: z.uuid(),
  assignmentRevision: z.string().regex(/^[a-f0-9]{64}$/),
  assignmentTitle: z.string().min(1).max(120),
  submittedAt: z.iso.datetime(),
  student: z.object({ id: z.uuid(), name: z.string().trim().min(1).max(100) }).strict(),
  progress: assignmentProgressSchema,
  aiActivity: z.array(assignmentAiActivitySchema).max(2_000),
  files: z.array(submissionFileSchema).max(50)
}).strict()

function sameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
}

async function readBoundedHandle(handle: Awaited<ReturnType<typeof fs.open>>, limit: number, label: string): Promise<Buffer> {
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, limit + 1 - total))
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
    if (!bytesRead) break
    total += bytesRead
    if (total > limit) throw new Error(`${label} is too large.`)
    chunks.push(chunk.subarray(0, bytesRead))
  }
  return Buffer.concat(chunks, total)
}

async function snapshotTaskFile(workspaceRoot: string, relativePath: string): Promise<AssignmentSubmissionFile> {
  const absolutePath = path.join(workspaceRoot, ...relativePath.split('/'))
  const handle = await fs.open(absolutePath, 'r').catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') throw new Error(`Complete the task file before submitting: ${relativePath}`)
    throw error
  })
  try {
    const before = await handle.stat({ bigint: true })
    if (!before.isFile()) throw new Error(`Task evidence is not a file: ${relativePath}`)
    if (before.size > BigInt(maxSnapshotBytes)) throw new Error(`Task evidence is larger than 2 MB: ${relativePath}`)
    const resolvedPath = await fs.realpath(absolutePath)
    if (!isPathInside(await fs.realpath(workspaceRoot), resolvedPath)) throw new Error(`Task evidence leaves the workspace: ${relativePath}`)
    const content = await readBoundedHandle(handle, maxSnapshotBytes, `Task evidence ${relativePath}`)
    const after = await handle.stat({ bigint: true })
    const pathIdentity = await fs.stat(await fs.realpath(absolutePath), { bigint: true })
    if (!sameFile(before, after) || !sameFile(before, pathIdentity)) throw new Error(`Task evidence changed while submitting: ${relativePath}`)
    return {
      path: relativePath,
      contentBase64: content.toString('base64'),
      sha256: createHash('sha256').update(content).digest('hex'),
      bytes: content.byteLength
    }
  } finally {
    await handle.close()
  }
}

export async function createAssignmentSubmission(
  workspaceRoot: string,
  manifest: AssignmentManifest,
  assignmentRevision: string,
  submittedProgress: AssignmentProgress,
  aiActivity: AssignmentAiActivity[]
): Promise<{ submission: AssignmentSubmission; payload: string }> {
  if (submittedProgress.status !== 'submitted') throw new Error('Submission progress must be finalized first.')
  if (submittedProgress.assignmentId !== manifest.id || submittedProgress.assignmentRevision !== assignmentRevision) {
    throw new Error('Submission progress does not match the assignment.')
  }
  if (Object.values(submittedProgress.tasks).some((task) => task.status !== 'completed')) throw new Error('Complete every assignment task before submitting.')
  const files: AssignmentSubmissionFile[] = []
  if (submittedProgress.evidenceConsent.includeFileSnapshots) {
    const seen = new Set<string>()
    let totalBytes = 0
    for (const task of manifest.tasks) {
      const key = process.platform === 'win32' ? task.filePath.toLowerCase() : task.filePath
      if (seen.has(key)) continue
      seen.add(key)
      const snapshot = await snapshotTaskFile(workspaceRoot, task.filePath)
      totalBytes += snapshot.bytes
      if (totalBytes > maxSubmissionFileBytes) throw new Error('Task evidence is larger than the 10 MB submission limit.')
      files.push(snapshot)
    }
  }
  const submission = assignmentSubmissionSchema.parse({
    schemaVersion: 1,
    id: randomUUID(),
    assignmentId: manifest.id,
    assignmentRevision,
    assignmentTitle: manifest.title,
    submittedAt: submittedProgress.updatedAt,
    student: submittedProgress.student,
    progress: submittedProgress,
    aiActivity: submittedProgress.evidenceConsent.includeAiActivity ? aiActivity : [],
    files
  })
  const payload = `${JSON.stringify(submission, null, 2)}\n`
  if (Buffer.byteLength(payload) > maxSubmissionJsonBytes) throw new Error('The submission is larger than 16 MB.')
  return { submission, payload }
}

export async function readAssignmentSubmission(
  filePath: string,
  manifest: AssignmentManifest,
  assignmentRevision: string
): Promise<AssignmentSubmission> {
  const pathStats = await fs.lstat(filePath)
  if (!pathStats.isFile() || pathStats.isSymbolicLink()) throw new Error('Choose a regular Wormie submission file.')
  if (pathStats.size > maxSubmissionJsonBytes) throw new Error('The submission is larger than 16 MB.')
  const handle = await fs.open(filePath, 'r')
  let raw: unknown
  try {
    const before = await handle.stat({ bigint: true })
    const content = await readBoundedHandle(handle, maxSubmissionJsonBytes, 'The submission')
    const after = await handle.stat({ bigint: true })
    const pathIdentity = await fs.stat(await fs.realpath(filePath), { bigint: true })
    if (!sameFile(before, after) || !sameFile(before, pathIdentity)) throw new Error('The submission changed while opening.')
    raw = JSON.parse(content.toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('The submission contains invalid JSON.')
    throw error
  } finally {
    await handle.close()
  }
  const parsed = assignmentSubmissionSchema.safeParse(raw)
  if (!parsed.success) throw new Error(`The submission is invalid: ${parsed.error.issues[0]?.message ?? 'Unknown validation error.'}`)
  const submission = parsed.data
  if (submission.assignmentId !== manifest.id || submission.assignmentRevision !== assignmentRevision) {
    throw new Error('This submission does not match the open assignment revision.')
  }
  if (submission.assignmentTitle !== manifest.title || submission.progress.status !== 'submitted' || submission.progress.assignmentId !== manifest.id || submission.progress.assignmentRevision !== assignmentRevision || submission.student.id !== submission.progress.student.id || submission.student.name !== submission.progress.student.name) {
    throw new Error('The submission progress does not match its assignment or student.')
  }
  if (
    submission.progress.evidenceConsent.includeAiActivity !== manifest.evidencePolicy.includeAiActivity ||
    submission.progress.evidenceConsent.includeFileSnapshots !== manifest.evidencePolicy.includeFileSnapshots
  ) throw new Error('The submission evidence consent does not match the assignment policy.')
  const expectedTaskIds = manifest.tasks.map((task) => task.id).sort()
  if (JSON.stringify(Object.keys(submission.progress.tasks).sort()) !== JSON.stringify(expectedTaskIds) || Object.values(submission.progress.tasks).some((task) => task.status !== 'completed')) {
    throw new Error('The submission does not contain completed progress for every task.')
  }
  if (!submission.progress.evidenceConsent.includeAiActivity && submission.aiActivity.length) throw new Error('The submission includes AI activity without consent.')
  if (!submission.progress.evidenceConsent.includeFileSnapshots && submission.files.length) throw new Error('The submission includes file snapshots without consent.')
  const seen = new Set<string>()
  let totalBytes = 0
  for (const file of submission.files) {
    const key = process.platform === 'win32' ? file.path.toLowerCase() : file.path
    if (seen.has(key)) throw new Error(`The submission contains duplicate file evidence: ${file.path}`)
    seen.add(key)
    if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) throw new Error(`Submission evidence has invalid Base64: ${file.path}`)
    const content = Buffer.from(file.contentBase64, 'base64')
    if (content.byteLength !== file.bytes || createHash('sha256').update(content).digest('hex') !== file.sha256) {
      throw new Error(`Submission evidence failed its integrity check: ${file.path}`)
    }
    totalBytes += file.bytes
    if (totalBytes > maxSubmissionFileBytes) throw new Error('Task evidence is larger than the 10 MB submission limit.')
  }
  if (submission.progress.evidenceConsent.includeFileSnapshots) {
    const expectedPaths = new Set(manifest.tasks.map((task) => process.platform === 'win32' ? task.filePath.toLowerCase() : task.filePath))
    if (seen.size !== expectedPaths.size || [...expectedPaths].some((filePath) => !seen.has(filePath))) {
      throw new Error('The submission is missing required task-file evidence.')
    }
  }
  return submission
}
