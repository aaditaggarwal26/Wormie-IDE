import { createHash } from 'node:crypto'
import path from 'node:path'
import type { ChangeFileStatus, ChangeInput } from '../shared/contracts'

function changeIdForRepository(repositoryRoot: string): string {
  return `git:${createHash('sha256').update(path.resolve(repositoryRoot).toLowerCase()).digest('hex').slice(0, 24)}`
}

function splitPatchByPath(patch: string, filePath: string): string {
  const marker = `diff --git a/${filePath} b/${filePath}`
  const start = patch.indexOf(marker)
  if (start < 0) return patch.slice(0, 20_000)
  const next = patch.indexOf('\ndiff --git ', start + marker.length)
  return patch.slice(start, next < 0 ? undefined : next).slice(0, 40_000)
}

export function buildStagedChangeInput(repositoryRoot: string, numstat: string, nameStatus: string, patchText: string): ChangeInput {
  const stats = new Map<string, { additions: number; deletions: number; binary: boolean }>()
  for (const line of numstat.split(/\r?\n/).filter(Boolean)) {
    const [rawAdditions, rawDeletions, ...pathParts] = line.split('\t')
    const filePath = pathParts.at(-1)
    if (!filePath) continue
    stats.set(filePath, {
      additions: rawAdditions === '-' ? 0 : Number.parseInt(rawAdditions, 10) || 0,
      deletions: rawDeletions === '-' ? 0 : Number.parseInt(rawDeletions, 10) || 0,
      binary: rawAdditions === '-' || rawDeletions === '-'
    })
  }
  const files = nameStatus.split(/\r?\n/).filter(Boolean).map((line) => {
    const [rawStatus, ...paths] = line.split('\t')
    const filePath = paths.at(-1) ?? ''
    const statusMap: Record<string, ChangeFileStatus> = { A: 'added', D: 'deleted', R: 'renamed', C: 'added', M: 'modified', T: 'modified' }
    const stat = stats.get(filePath) ?? { additions: 0, deletions: 0, binary: false }
    return {
      path: filePath,
      status: statusMap[rawStatus[0]] ?? 'modified',
      ...stat,
      patch: stat.binary ? undefined : splitPatchByPath(patchText, filePath)
    }
  }).filter((file) => file.path)
  return { id: changeIdForRepository(repositoryRoot), source: 'git_commit', title: 'Staged changes', files }
}

export function validateCommitMessage(rawMessage: string): string {
  const message = typeof rawMessage === 'string' ? rawMessage.trim() : ''
  if (!message) throw new Error('Enter a commit message.')
  if (message.length > 2_000) throw new Error('Commit message must be 2,000 characters or fewer.')
  if (message.includes('\0')) throw new Error('Commit message contains invalid characters.')
  return message
}
