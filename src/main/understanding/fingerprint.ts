import { createHash } from 'node:crypto'
import type { ChangeInput } from '../../shared/contracts'

function normalizeText(value: string | undefined): string | null {
  if (value === undefined) return null
  const lines = value.replace(/\r\n?/g, '\n').split('\n').map((line) => line.replace(/[ \t]+$/g, ''))
  while (lines.at(-1) === '') lines.pop()
  return lines.join('\n')
}

export function fingerprintChange(input: ChangeInput): string {
  const files = [...input.files]
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((file) => ({
      path: file.path.replace(/\\/g, '/'),
      status: file.status,
      additions: file.additions,
      deletions: file.deletions,
      binary: Boolean(file.binary),
      before: normalizeText(file.beforeContent),
      after: normalizeText(file.afterContent),
      patch: normalizeText(file.patch)
    }))
  return createHash('sha256').update(JSON.stringify({ source: input.source, files })).digest('hex')
}
