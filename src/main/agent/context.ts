import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { FileTreeNode, LearningRequest } from '../../shared/contracts'
import { isPathInside } from '../pathSafety'
import { createWorkspaceSnapshot } from '../workspace'

const maxContextCharacters = 120_000
const maxContextFileBytes = 256 * 1024
const maxManifestEntries = 400
const maxSelectedFiles = 6

const sensitiveNames = new Set([
  '.env',
  '.npmrc',
  '.pypirc',
  'auth.json',
  'credentials',
  'credentials.json',
  'id_rsa',
  'id_ed25519',
  'secrets.json'
])

const sensitiveExtensions = new Set(['.key', '.pem', '.p12', '.pfx', '.keystore'])
const excludedSegments = new Set(['.git', 'node_modules'])

function isSensitivePath(filePath: string): boolean {
  const segments = filePath.split(/[\\/]/).map((segment) => segment.toLowerCase())
  const name = segments.at(-1) ?? ''
  return segments.some((segment) => excludedSegments.has(segment)) ||
    sensitiveNames.has(name) ||
    name.startsWith('.env.') ||
    sensitiveExtensions.has(path.extname(name)) ||
    /(?:secret|credential|private[-_]?key)/i.test(name)
}

function flattenTree(nodes: FileTreeNode[], rootPath: string, result: string[]): void {
  for (const node of nodes) {
    if (result.length >= maxManifestEntries) return
    const relativePath = path.relative(rootPath, node.path)
    if (isSensitivePath(relativePath)) continue
    result.push(`${node.type === 'directory' ? 'd' : 'f'} ${relativePath}`)
    if (node.children) flattenTree(node.children, rootPath, result)
  }
}

function redactLikelySecrets(content: string): string {
  return content
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED TOKEN]')
    .replace(/((?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["'])([^"'\r\n]{8,})(["'])/gi, '$1[REDACTED]$3')
}

async function readContextFile(rootPath: string, candidatePath: string): Promise<string | null> {
  let resolvedPath: string
  try {
    resolvedPath = await fs.realpath(candidatePath)
  } catch {
    return null
  }

  if (!isPathInside(rootPath, resolvedPath) || isSensitivePath(path.relative(rootPath, resolvedPath))) return null
  const stats = await fs.stat(resolvedPath)
  if (!stats.isFile() || stats.size > maxContextFileBytes) return null
  const content = await fs.readFile(resolvedPath, 'utf8')
  if (content.includes('\0')) return null
  return `\n<workspace-file path="${path.relative(rootPath, resolvedPath)}">\n${redactLikelySecrets(content)}\n</workspace-file>`
}

export async function buildWorkspaceContext(rootPath: string, request: LearningRequest): Promise<string> {
  const snapshot = await createWorkspaceSnapshot(rootPath)
  const manifest: string[] = []
  flattenTree(snapshot.entries, rootPath, manifest)

  const preferredPaths = ['PROJECT.md', 'AGENTS.md', 'package.json'].map((name) => path.join(rootPath, name))
  const openPaths = Array.isArray(request.openPaths) ? request.openPaths.slice(0, maxSelectedFiles) : []
  const selectedPaths = [request.activePath, ...openPaths]
    .filter((filePath): filePath is string => typeof filePath === 'string' && filePath.length > 0)
    .slice(0, maxSelectedFiles)
  const uniquePaths = [...new Set([...preferredPaths, ...selectedPaths])]

  let context = `<workspace-manifest>\n${manifest.join('\n')}\n</workspace-manifest>`
  for (const filePath of uniquePaths) {
    const section = await readContextFile(rootPath, filePath)
    if (!section || context.length + section.length > maxContextCharacters) continue
    context += section
  }

  return context
}
