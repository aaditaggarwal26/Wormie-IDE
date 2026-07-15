import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { BigIntStats } from 'node:fs'
import { z } from 'zod'
import type { AssignmentManifest } from '../../shared/contracts'
import { isPathInside } from '../pathSafety'
import { assignmentManifestSchema, portableWorkspacePathSchema } from './schema'
import { readAssignment } from './storage'

const ignoredDirectories = new Set(['.git', '.idea', '.next', '.turbo', '.vscode', '.wormie', 'build', 'coverage', 'dist', 'node_modules', 'out', 'release'])
const protectedDirectories = new Set(['.aws', '.azure', '.docker', '.gnupg', '.kube', '.ssh'])
const maxPackageFiles = 5_000
const maxPackageFileBytes = 2 * 1024 * 1024
const maxPackageBytes = 25 * 1024 * 1024
const maxPackageJsonBytes = 40 * 1024 * 1024

type PackagedFile = {
  path: string
  contentBase64: string
  sha256: string
  bytes: number
}

export type AssignmentPackage = {
  schemaVersion: 1
  id: string
  createdAt: string
  assignment: AssignmentManifest
  files: PackagedFile[]
}

const packageFileSchema = z.object({
  path: z.string().min(1).max(500),
  contentBase64: z.string().max(3_000_000),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  bytes: z.number().int().min(0).max(maxPackageFileBytes)
}).strict()

const assignmentPackageSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  assignment: assignmentManifestSchema,
  files: z.array(packageFileSchema).max(maxPackageFiles)
}).strict()

function validatePackagePath(relativePath: string): string {
  if (!portableWorkspacePathSchema.safeParse(relativePath).success) throw new Error(`Package contains an invalid path: ${relativePath}`)
  const segments = relativePath.split('/')
  if (segments.some((segment) => ['.git', '.wormie', 'node_modules'].includes(segment.toLowerCase()) || protectedDirectories.has(segment.toLowerCase())) || isProtectedFile(segments.at(-1)!)) {
    throw new Error(`Package contains a protected path: ${relativePath}`)
  }
  return relativePath
}

function importFolderName(title: string): string {
  const name = title.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').replace(/[ .]+$/g, '').trim().slice(0, 70)
  return `${name || 'Wormie assignment'} - assignment`
}

function isProtectedFile(name: string): boolean {
  const lower = name.toLowerCase()
  if (lower === '.env.example' || lower === '.env.sample') return false
  return lower.endsWith('.wormie-package.json') || lower === '.env' || lower.startsWith('.env.') || lower === '.envrc' ||
    lower === 'terraform.tfstate' || lower.startsWith('terraform.tfstate.') || lower.endsWith('.tfvars') || lower.endsWith('.auto.tfvars') ||
    ['.git-credentials', '.netrc', '.npmrc', '.pypirc', 'application_default_credentials.json', 'auth.json', 'config.json', 'credentials', 'credentials.json', 'id_dsa', 'id_ed25519', 'id_ecdsa', 'id_rsa', 'secrets.json'].includes(lower) ||
    ['.key', '.pem', '.p12', '.pfx', '.keystore'].includes(path.extname(lower))
}

function isSameFile(left: BigIntStats, right: BigIntStats): boolean {
  return left.dev === right.dev && left.ino === right.ino
}

function isUnchangedFile(left: BigIntStats, right: BigIntStats): boolean {
  return isSameFile(left, right) && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs
}

async function assertImportRoot(rootPath: string, expectedIdentity: BigIntStats): Promise<void> {
  const pathStats = await fs.lstat(rootPath)
  if (!pathStats.isDirectory() || pathStats.isSymbolicLink()) throw new Error('The package destination changed during import.')
  const resolvedRoot = await fs.realpath(rootPath)
  const expectedPath = process.platform === 'win32' ? path.resolve(rootPath).toLowerCase() : path.resolve(rootPath)
  const actualPath = process.platform === 'win32' ? path.resolve(resolvedRoot).toLowerCase() : path.resolve(resolvedRoot)
  const currentIdentity = await fs.stat(resolvedRoot, { bigint: true })
  if (actualPath !== expectedPath || !isSameFile(expectedIdentity, currentIdentity)) throw new Error('The package destination changed during import.')
}

async function readPackageFile(handle: Awaited<ReturnType<typeof fs.open>>, initial: BigIntStats, relativePath: string): Promise<Buffer> {
  if (initial.size > BigInt(maxPackageFileBytes)) throw new Error(`Starter file is larger than 2 MB: ${relativePath}`)
  const chunks: Buffer[] = []
  let total = 0
  while (true) {
    const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxPackageFileBytes + 1 - total))
    const { bytesRead } = await handle.read(chunk, 0, chunk.length, null)
    if (!bytesRead) break
    total += bytesRead
    if (total > maxPackageFileBytes) throw new Error(`Starter file is larger than 2 MB: ${relativePath}`)
    chunks.push(chunk.subarray(0, bytesRead))
  }
  return Buffer.concat(chunks, total)
}

async function collectFiles(rootPath: string, directoryPath: string, files: PackagedFile[], total: { bytes: number }): Promise<void> {
  const canonicalRoot = await fs.realpath(rootPath)
  const canonicalDirectory = await fs.realpath(directoryPath)
  if (!isPathInside(canonicalRoot, canonicalDirectory)) throw new Error('A starter directory leaves the workspace.')
  const entries = await fs.readdir(directoryPath, { withFileTypes: true })
  for (const entry of entries) {
    const lowerName = entry.name.toLowerCase()
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory() && (ignoredDirectories.has(lowerName) || protectedDirectories.has(lowerName))) continue
    if (entry.isFile() && isProtectedFile(entry.name)) continue

    const entryPath = path.join(directoryPath, entry.name)
    if (entry.isDirectory()) {
      await collectFiles(rootPath, entryPath, files, total)
      continue
    }
    if (!entry.isFile()) continue
    if (files.length >= maxPackageFiles) throw new Error('The starter project has more than 5,000 packageable files.')

    const pathStats = await fs.lstat(entryPath)
    if (pathStats.isSymbolicLink() || !pathStats.isFile()) continue
    const handle = await fs.open(entryPath, 'r')
    let content: Buffer
    const relativePath = validatePackagePath(path.relative(rootPath, entryPath).replace(/\\/g, '/'))
    try {
      const handleIdentity = await handle.stat({ bigint: true })
      const resolvedPath = await fs.realpath(entryPath)
      if (!isPathInside(canonicalRoot, resolvedPath)) throw new Error(`Starter file leaves the workspace: ${path.relative(rootPath, entryPath)}`)
      const pathIdentity = await fs.stat(resolvedPath, { bigint: true })
      if (!isSameFile(handleIdentity, pathIdentity)) throw new Error(`Starter file changed during export: ${path.relative(rootPath, entryPath)}`)
      content = await readPackageFile(handle, handleIdentity, relativePath)
      const finalHandleIdentity = await handle.stat({ bigint: true })
      const finalPathIdentity = await fs.stat(await fs.realpath(entryPath), { bigint: true })
      if (!isUnchangedFile(handleIdentity, finalHandleIdentity) || !isUnchangedFile(handleIdentity, finalPathIdentity)) {
        throw new Error(`Starter file changed during export: ${relativePath}`)
      }
    } finally {
      await handle.close()
    }
    if (content.byteLength > maxPackageFileBytes) throw new Error(`Starter file is larger than 2 MB: ${path.relative(rootPath, entryPath)}`)
    if (total.bytes + content.byteLength > maxPackageBytes) throw new Error('The starter project is larger than the 25 MB local package limit.')
    total.bytes += content.byteLength
    files.push({
      path: relativePath,
      contentBase64: content.toString('base64'),
      sha256: createHash('sha256').update(content).digest('hex'),
      bytes: content.byteLength
    })
  }
}

export async function createAssignmentPackage(workspaceRoot: string): Promise<{
  value: AssignmentPackage
  payload: string
  totalBytes: number
}> {
  const assignment = await readAssignment(workspaceRoot)
  if (!assignment.manifest) throw new Error('Create an assignment before exporting a package.')
  const files: PackagedFile[] = []
  const total = { bytes: 0 }
  await collectFiles(workspaceRoot, workspaceRoot, files, total)
  const packagedPaths = new Set(files.map((file) => process.platform === 'win32' ? file.path.toLowerCase() : file.path))
  for (const task of assignment.manifest.tasks) {
    if (task.kind === 'create') continue
    const key = process.platform === 'win32' ? task.filePath.toLowerCase() : task.filePath
    if (!packagedPaths.has(key)) throw new Error(`Task file cannot be included in the package: ${task.filePath}`)
  }
  const value: AssignmentPackage = {
    schemaVersion: 1,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    assignment: assignment.manifest,
    files
  }
  return { value, payload: `${JSON.stringify(value, null, 2)}\n`, totalBytes: total.bytes }
}

export async function importAssignmentPackage(
  packageFilePath: string,
  destinationParent: string
): Promise<{ rootPath: string; assignmentTitle: string; fileCount: number }> {
  const packageStats = await fs.lstat(packageFilePath)
  if (!packageStats.isFile() || packageStats.isSymbolicLink()) throw new Error('Choose a regular Wormie package file.')
  if (packageStats.size > maxPackageJsonBytes) throw new Error('Wormie packages are limited to 40 MB.')
  let rawValue: unknown
  const packageHandle = await fs.open(packageFilePath, 'r')
  try {
    const handleIdentity = await packageHandle.stat({ bigint: true })
    const resolvedPackagePath = await fs.realpath(packageFilePath)
    const pathIdentity = await fs.stat(resolvedPackagePath, { bigint: true })
    if (!isSameFile(handleIdentity, pathIdentity)) throw new Error('The Wormie package changed while opening.')
    const chunks: Buffer[] = []
    let totalRead = 0
    while (true) {
      const chunk = Buffer.allocUnsafe(Math.min(64 * 1024, maxPackageJsonBytes + 1 - totalRead))
      const { bytesRead } = await packageHandle.read(chunk, 0, chunk.length, null)
      if (bytesRead === 0) break
      totalRead += bytesRead
      if (totalRead > maxPackageJsonBytes) throw new Error('Wormie packages are limited to 40 MB.')
      chunks.push(chunk.subarray(0, bytesRead))
    }
    const finalIdentity = await packageHandle.stat({ bigint: true })
    const finalPathIdentity = await fs.stat(await fs.realpath(packageFilePath), { bigint: true })
    if (!isSameFile(handleIdentity, finalIdentity) || !isSameFile(handleIdentity, finalPathIdentity)) {
      throw new Error('The Wormie package changed while opening.')
    }
    rawValue = JSON.parse(Buffer.concat(chunks, totalRead).toString('utf8'))
  } catch (error) {
    if (error instanceof SyntaxError) throw new Error('The Wormie package contains invalid JSON.')
    throw error
  } finally {
    await packageHandle.close()
  }
  const parsed = assignmentPackageSchema.safeParse(rawValue)
  if (!parsed.success) throw new Error(`The Wormie package is invalid: ${parsed.error.issues[0]?.message ?? 'Unknown validation error.'}`)
  const canonicalParent = await fs.realpath(destinationParent)
  const rootPath = path.join(canonicalParent, importFolderName(parsed.data.assignment.title))
  if (!isPathInside(canonicalParent, rootPath)) throw new Error('The package destination is invalid.')
  await fs.mkdir(rootPath)
  const rootIdentity = await fs.stat(rootPath, { bigint: true })

  const seenPaths = new Set<string>()
  let totalBytes = 0
  try {
    for (const file of parsed.data.files) {
      await assertImportRoot(rootPath, rootIdentity)
      const portablePath = validatePackagePath(file.path)
      const key = process.platform === 'win32' ? portablePath.toLowerCase() : portablePath
      if (seenPaths.has(key)) throw new Error(`Package contains a duplicate path: ${portablePath}`)
      seenPaths.add(key)
      if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.contentBase64)) {
        throw new Error(`Package file has invalid Base64 content: ${portablePath}`)
      }
      const content = Buffer.from(file.contentBase64, 'base64')
      if (content.byteLength !== file.bytes || createHash('sha256').update(content).digest('hex') !== file.sha256) {
        throw new Error(`Package file failed its integrity check: ${portablePath}`)
      }
      totalBytes += content.byteLength
      if (totalBytes > maxPackageBytes) throw new Error('The starter project is larger than the 25 MB local package limit.')
      const destination = path.join(rootPath, ...portablePath.split('/'))
      if (!isPathInside(rootPath, destination)) throw new Error(`Package path leaves the destination: ${portablePath}`)
      let currentDirectory = rootPath
      for (const segment of portablePath.split('/').slice(0, -1)) {
        currentDirectory = path.join(currentDirectory, segment)
        await fs.mkdir(currentDirectory).catch((error: NodeJS.ErrnoException) => {
          if (error.code !== 'EEXIST') throw error
        })
        const directoryStats = await fs.lstat(currentDirectory)
        if (!directoryStats.isDirectory() || directoryStats.isSymbolicLink()) throw new Error(`Package directory is unsafe: ${portablePath}`)
        const resolvedDirectory = await fs.realpath(currentDirectory)
        if (!isPathInside(rootPath, resolvedDirectory)) throw new Error(`Package directory leaves the destination: ${portablePath}`)
      }
      await fs.writeFile(destination, content, { flag: 'wx' })
      await assertImportRoot(rootPath, rootIdentity)
      const resolvedDestination = await fs.realpath(destination)
      if (!isPathInside(rootPath, resolvedDestination)) {
        throw new Error('The package destination changed during import.')
      }
    }
    const importedPaths = new Set(parsed.data.files.map((file) => process.platform === 'win32' ? file.path.toLowerCase() : file.path))
    for (const task of parsed.data.assignment.tasks) {
      if (task.kind === 'create') continue
      const key = process.platform === 'win32' ? task.filePath.toLowerCase() : task.filePath
      if (!importedPaths.has(key)) throw new Error(`Package is missing a required task file: ${task.filePath}`)
    }
    await assertImportRoot(rootPath, rootIdentity)
    const assignmentDirectory = path.join(rootPath, '.wormie')
    await fs.mkdir(assignmentDirectory)
    await fs.writeFile(path.join(assignmentDirectory, 'assignment.json'), `${JSON.stringify(parsed.data.assignment, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await fs.writeFile(path.join(assignmentDirectory, 'student.json'), `${JSON.stringify({ schemaVersion: 1, packageId: parsed.data.id, importedAt: new Date().toISOString() }, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    await assertImportRoot(rootPath, rootIdentity)
    await readAssignment(rootPath)
    return { rootPath, assignmentTitle: parsed.data.assignment.title, fileCount: parsed.data.files.length }
  } catch (error) {
    try {
      if (isPathInside(canonicalParent, rootPath)) await fs.rm(rootPath, { recursive: true, force: true })
    } catch (cleanupError) {
      const original = error instanceof Error ? error.message : 'Package import failed.'
      const cleanup = cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error.'
      throw new Error(`${original} The partial destination could not be removed: ${cleanup}`)
    }
    throw error
  }
}
