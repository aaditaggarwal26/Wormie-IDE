import { createHash } from 'node:crypto'

export function fingerprintContent(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

export function assertExpectedFingerprint(expected: string, actual: string): void {
  if (typeof expected !== 'string' || expected.length !== 64 || expected !== actual) {
    throw new Error('This file changed on disk after it was opened. Review the disk version before saving.')
  }
}
