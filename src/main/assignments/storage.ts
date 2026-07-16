import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BigIntStats } from 'node:fs'
import type {
  AssignmentManifest,
  AssignmentManifestDraft,
  AssignmentWorkspaceState
} from '../../shared/contracts'
import { isPathInside } from '../pathSafety'
import { assignmentManifestDraftSchema, assignmentManifestSchema } from './schema'

const assignmentDirectoryName = '.wormie'
const assignmentFileName = 'assignment.json'
const maxAssignmentBytes = 256 * 1024
const saveQueues = new Map<string, Promise<void>>()

function assignmentPaths(workspaceRoot: string): { directoryPath: string; manifestPath: string } {
  const directoryPath = path.join(workspaceRoot, assignmentDirectoryName)
  return { directoryPath, manifestPath: path.join(directoryPath, assignmentFileName) }
}

async function assertSafeAssignmentDirectory(workspaceRoot: string, directoryPath: string): Promise<void> {
  const root = await fs.realpath(workspaceRoot)
  const directoryParent = await fs.realpath(path.dirname(directoryPath))
  const resolvedDirectory = path.join(directoryParent, path.basename(directoryPath))
  if (!isPathInside(root, resolvedDirectory)) throw new Error('The assignment directory is outside the workspace.')

  const stats = await fs.lstat(directoryPath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
  if (stats?.isSymbolicLink()) throw new Error('The .wormie directory cannot be a symbolic link.')
  if (stats && !stats.isDirectory()) throw new Error('The .wormie path must be a directory.')
}

async function lstatIfPresent(filePath: string): Promise<Awaited<ReturnType<typeof fs.lstat>> | null> {
  return fs.lstat(filePath).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return null
    throw error
  })
}

function isSameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

async function readHandleBounded(
  handle: Awaited<ReturnType<typeof fs.open>>,
  maxBytes: number
): Promise<Buffer> {
  const buffer = Buffer.allocUnsafe(maxBytes + 1)
  let offset = 0
  while (offset < buffer.length) {
    const { bytesRead } = await handle.read(buffer, offset, buffer.length - offset, null)
    if (bytesRead === 0) break
    offset += bytesRead
  }
  if (offset > maxBytes) throw new Error('The assignment manifest is larger than 256 KB and cannot be recovered automatically.')
  return buffer.subarray(0, offset)
}

function serializeManifest(value: unknown): string {
  const payload = `${JSON.stringify(value, null, 2)}\n`
  if (Buffer.byteLength(payload, 'utf8') > maxAssignmentBytes) {
    throw new Error('The assignment manifest is larger than 256 KB.')
  }
  return payload
}

function revisionFor(payload: string): string {
  return createHash('sha256').update(payload).digest('hex')
}

async function syncDirectory(directoryPath: string): Promise<void> {
  const handle = await fs.open(directoryPath, 'r')
  try {
    await handle.sync().catch((error: NodeJS.ErrnoException) => {
      if (process.platform !== 'win32' || error.code !== 'EPERM') throw error
    })
  } finally {
    await handle.close()
  }
}

async function writeJsonAtomically(
  workspaceRoot: string,
  directoryPath: string,
  filePath: string,
  payload: string,
  beforeReplace?: () => Promise<void>
): Promise<void> {
  const canonicalRoot = await fs.realpath(workspaceRoot)
  const canonicalDirectory = await fs.realpath(directoryPath)
  if (!isPathInside(canonicalRoot, canonicalDirectory)) throw new Error('The assignment directory is outside the workspace.')
  const directoryIdentity = await fs.stat(canonicalDirectory, { bigint: true })
  const temporaryPath = `${filePath}.${randomUUID()}.tmp`
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null
  try {
    handle = await fs.open(temporaryPath, 'wx')
    const handleIdentity = await handle.stat({ bigint: true })
    const temporaryPathIdentity = await fs.stat(temporaryPath, { bigint: true })
    if (!isSameFile(handleIdentity, temporaryPathIdentity)) throw new Error('The assignment temporary file changed during save.')
    const temporaryRealPath = await fs.realpath(temporaryPath)
    if (!isPathInside(canonicalDirectory, temporaryRealPath)) throw new Error('The assignment temporary file is outside the workspace.')
    await handle.writeFile(payload, 'utf8')
    await handle.sync()
    await handle.close()
    handle = null
    const currentDirectory = await fs.realpath(directoryPath)
    const currentDirectoryIdentity = await fs.stat(currentDirectory, { bigint: true })
    if (currentDirectory !== canonicalDirectory || !isSameFile(directoryIdentity, currentDirectoryIdentity)) {
      throw new Error('The assignment directory changed during save.')
    }
    const stagedIdentity = await fs.stat(temporaryPath, { bigint: true })
    if (!isSameFile(handleIdentity, stagedIdentity)) throw new Error('The assignment temporary file changed during save.')
    await beforeReplace?.()
    await fs.rename(temporaryPath, filePath)
    const finalRealPath = await fs.realpath(filePath)
    if (!isPathInside(canonicalDirectory, finalRealPath)) throw new Error('The assignment manifest was written outside the workspace.')
    const finalIdentity = await fs.stat(finalRealPath, { bigint: true })
    if (!isSameFile(handleIdentity, finalIdentity)) throw new Error('The assignment manifest changed during save.')
    await syncDirectory(canonicalDirectory)
  } catch (error) {
    await handle?.close().catch(() => undefined)
    await fs.unlink(temporaryPath).catch(() => undefined)
    throw error
  }
}

async function verifyTaskPaths(
  workspaceRoot: string,
  manifest: AssignmentManifest,
  requireExistingFiles: boolean
): Promise<void> {
  const canonicalRoot = await fs.realpath(workspaceRoot)
  for (const task of manifest.tasks) {
    const candidatePath = path.resolve(canonicalRoot, ...task.filePath.split('/'))
    if (!isPathInside(canonicalRoot, candidatePath)) throw new Error(`Task path is outside the workspace: ${task.filePath}`)
    const candidateStats = await lstatIfPresent(candidatePath)
    if (candidateStats?.isSymbolicLink()) throw new Error(`Task path cannot be a symbolic link: ${task.filePath}`)

    if (task.kind === 'create') {
      const resolvedTarget = await fs.realpath(candidatePath).catch(() => null)
      if (resolvedTarget) {
        if (!isPathInside(canonicalRoot, resolvedTarget)) throw new Error(`Create task path leaves the workspace: ${task.filePath}`)
        const targetStats = await fs.stat(resolvedTarget)
        if (!targetStats.isFile()) throw new Error(`Create task path is not a file: ${task.filePath}`)
        if (requireExistingFiles) throw new Error(`Create task file already exists: ${task.filePath}`)
        continue
      }
      const resolvedParent = await fs.realpath(path.dirname(candidatePath)).catch(() => null)
      if (!resolvedParent || !isPathInside(canonicalRoot, resolvedParent)) {
        throw new Error(`Create task parent is outside or missing from the workspace: ${task.filePath}`)
      }
      continue
    }

    const resolvedPath = await fs.realpath(candidatePath).catch(() => null)
    if (!resolvedPath) {
      if (!requireExistingFiles) {
        const resolvedParent = await fs.realpath(path.dirname(candidatePath)).catch(() => null)
        if (resolvedParent && isPathInside(canonicalRoot, resolvedParent)) continue
      }
      throw new Error(`Task file does not exist: ${task.filePath}`)
    }
    if (!isPathInside(canonicalRoot, resolvedPath)) throw new Error(`Task path leaves the workspace: ${task.filePath}`)
    const stats = await fs.stat(resolvedPath)
    if (!stats.isFile()) throw new Error(`Task path is not a file: ${task.filePath}`)
  }
}

export async function readAssignment(workspaceRoot: string): Promise<AssignmentWorkspaceState> {
  const { directoryPath, manifestPath } = assignmentPaths(workspaceRoot)
  await assertSafeAssignmentDirectory(workspaceRoot, directoryPath)

  const pathStats = await lstatIfPresent(manifestPath)
  if (!pathStats) return { workspaceRoot, role: 'teacher', manifest: null, manifestPath: null, revision: null, progress: null }
  if (pathStats.isSymbolicLink() || !pathStats.isFile()) throw new Error('The assignment manifest must be a regular file.')

  let value: unknown
  let handle: Awaited<ReturnType<typeof fs.open>> | null = null
  try {
    handle = await fs.open(manifestPath, 'r')
    const stats = await handle.stat()
    if (!stats.isFile()) throw new Error('The assignment manifest must be a regular file.')
    if (stats.size > maxAssignmentBytes) throw new Error('The assignment manifest is larger than 256 KB.')
    const handleIdentity = await handle.stat({ bigint: true })
    const pathIdentity = await fs.stat(manifestPath, { bigint: true })
    if (!isSameFile(handleIdentity, pathIdentity)) throw new Error('The assignment manifest changed while opening.')
    const resolvedManifest = await fs.realpath(manifestPath)
    if (!isPathInside(await fs.realpath(workspaceRoot), resolvedManifest)) {
      throw new Error('The assignment manifest is outside the workspace.')
    }
    const resolvedIdentity = await fs.stat(resolvedManifest, { bigint: true })
    if (!isSameFile(handleIdentity, resolvedIdentity)) throw new Error('The assignment manifest changed while opening.')
    const payload = await handle.readFile('utf8')
    value = JSON.parse(payload)
    const result = assignmentManifestSchema.safeParse(value)
    if (!result.success) throw new Error(`The assignment manifest is invalid: ${result.error.issues[0]?.message ?? 'Unknown validation error.'}`)
    await verifyTaskPaths(workspaceRoot, result.data, false)
    return { workspaceRoot, role: 'teacher', manifest: result.data, manifestPath, revision: revisionFor(payload), progress: null }
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('The assignment manifest contains invalid JSON.')
    throw error
  } finally {
    await handle?.close().catch(() => undefined)
  }

  throw new Error('The assignment manifest could not be read.')
}

export async function readAssignmentRevision(workspaceRoot: string): Promise<string | null> {
  const manifestPath = assignmentPaths(workspaceRoot).manifestPath
  const stats = await lstatIfPresent(manifestPath)
  if (!stats) return null
  if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('The assignment manifest must be a regular file.')
  const handle = await fs.open(manifestPath, 'r')
  try {
    const stats = await handle.stat()
    if (stats.size > maxAssignmentBytes) throw new Error('The assignment manifest is larger than 256 KB and cannot be recovered automatically.')
    const handleIdentity = await handle.stat({ bigint: true })
    const resolvedPath = await fs.realpath(manifestPath)
    if (!isPathInside(await fs.realpath(workspaceRoot), resolvedPath)) throw new Error('The assignment manifest is outside the workspace.')
    const pathIdentity = await fs.stat(resolvedPath, { bigint: true })
    if (!isSameFile(handleIdentity, pathIdentity)) throw new Error('The assignment manifest changed while checking its revision.')
    const payload = await readHandleBounded(handle, maxAssignmentBytes)
    const finalHandleIdentity = await handle.stat({ bigint: true })
    const finalResolvedPath = await fs.realpath(manifestPath)
    const finalPathIdentity = await fs.stat(finalResolvedPath, { bigint: true })
    if (
      finalResolvedPath !== resolvedPath ||
      !isSameFile(handleIdentity, finalHandleIdentity) ||
      !isSameFile(handleIdentity, finalPathIdentity)
    ) {
      throw new Error('The assignment manifest changed while checking its revision.')
    }
    return createHash('sha256').update(payload).digest('hex')
  } finally {
    await handle.close()
  }
}

async function saveAssignmentUnlocked(
  workspaceRoot: string,
  rawDraft: AssignmentManifestDraft,
  expectedRevision: string | null,
  replaceInvalid: boolean
): Promise<AssignmentWorkspaceState> {
  const draft = assignmentManifestDraftSchema.parse(rawDraft)
  let existing: AssignmentWorkspaceState = { workspaceRoot, role: 'teacher', manifest: null, manifestPath: null, revision: null, progress: null }
  let invalidManifest = false
  try {
    existing = await readAssignment(workspaceRoot)
  } catch (error) {
    if (!replaceInvalid) throw error
    invalidManifest = true
  }
  if (replaceInvalid && !invalidManifest) throw new Error('The assignment manifest is valid and cannot be replaced through recovery.')
  if (!replaceInvalid && existing.revision !== expectedRevision) {
    throw new Error('The assignment changed outside this editor. Reload it before saving your work.')
  }
  if (draft.id && existing.manifest && draft.id !== existing.manifest.id) {
    throw new Error('The assignment ID does not match the existing workspace assignment.')
  }

  const now = new Date().toISOString()
  const manifest = assignmentManifestSchema.parse({
    ...draft,
    schemaVersion: 1,
    id: existing.manifest?.id ?? draft.id ?? randomUUID(),
    createdAt: existing.manifest?.createdAt ?? now,
    updatedAt: now
  })
  await verifyTaskPaths(workspaceRoot, manifest, true)
  const payload = serializeManifest(manifest)

  const { directoryPath, manifestPath } = assignmentPaths(workspaceRoot)
  await assertSafeAssignmentDirectory(workspaceRoot, directoryPath)
  await fs.mkdir(directoryPath)
    .catch((error: NodeJS.ErrnoException) => {
      if (error.code !== 'EEXIST') throw error
    })
  let backupPath: string | null = null
  if (invalidManifest) {
    if (await readAssignmentRevision(workspaceRoot) !== expectedRevision) {
      throw new Error('The invalid assignment changed outside this editor. Reload it before recovery.')
    }
    const stats = await fs.lstat(manifestPath)
    if (!stats.isFile() || stats.isSymbolicLink()) throw new Error('Only a regular invalid manifest can be recovered automatically.')
    backupPath = path.join(directoryPath, `assignment.invalid-${Date.now()}.json`)
    await fs.rename(manifestPath, backupPath)
  }
  try {
    await writeJsonAtomically(
      workspaceRoot,
      directoryPath,
      manifestPath,
      payload,
      invalidManifest ? undefined : async () => {
        if (await readAssignmentRevision(workspaceRoot) !== expectedRevision) {
          throw new Error('The assignment changed outside this editor. Reload it before saving your work.')
        }
      }
    )
  } catch (error) {
    if (backupPath) await fs.rename(backupPath, manifestPath).catch(() => undefined)
    throw error
  }
  return { workspaceRoot, role: 'teacher', manifest, manifestPath, revision: revisionFor(payload), progress: null }
}

export async function saveAssignment(
  workspaceRoot: string,
  rawDraft: AssignmentManifestDraft,
  expectedRevision: string | null = null,
  replaceInvalid = false
): Promise<AssignmentWorkspaceState> {
  const queueKey = process.platform === 'win32'
    ? path.resolve(workspaceRoot).toLowerCase()
    : path.resolve(workspaceRoot)
  const previous = saveQueues.get(queueKey) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => { release = resolve })
  saveQueues.set(queueKey, current)

  await previous.catch(() => undefined)
  try {
    return await saveAssignmentUnlocked(workspaceRoot, rawDraft, expectedRevision, replaceInvalid)
  } finally {
    release()
    if (saveQueues.get(queueKey) === current) saveQueues.delete(queueKey)
  }
}

export function getAssignmentManifestPath(workspaceRoot: string): string {
  return assignmentPaths(workspaceRoot).manifestPath
}
