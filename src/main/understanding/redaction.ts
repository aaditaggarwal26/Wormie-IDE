import path from 'node:path'
import type { ChangeFileInput, ChangeInput } from '../../shared/contracts'

const sensitiveNames = /(?:^|[\\/])(?:\.env(?:\..*)?|credentials(?:\.json)?|secrets?\.json|auth\.json|\.npmrc|\.pypirc)$/i
const sensitiveExtensions = /\.(?:key|pem|p12|pfx|keystore)$/i
const excluded = /(?:^|[\\/])(?:\.git|node_modules)(?:[\\/]|$)/i
const lockfiles = /(?:^|[\\/])(?:package-lock\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?)$/i
const maxPatchCharacters = 20_000

export function redactLikelySecrets(content: string): string {
  return content
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED TOKEN]')
    .replace(/((?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?)([^"'\s\r\n]{8,})(["']?)/gi, '$1[REDACTED]$3')
}

function safeFile(file: ChangeFileInput): boolean {
  const normalized = file.path.replace(/\\/g, '/')
  return !file.binary && !sensitiveNames.test(normalized) && !sensitiveExtensions.test(path.extname(normalized)) && !excluded.test(normalized) && !lockfiles.test(normalized)
}

export function sanitizeChangeContext(input: ChangeInput): ChangeInput {
  return {
    ...input,
    description: input.description ? redactLikelySecrets(input.description).slice(0, 4_000) : undefined,
    files: input.files.filter(safeFile).slice(0, 30).map((file) => ({
      ...file,
      beforeContent: undefined,
      afterContent: undefined,
      patch: file.patch ? redactLikelySecrets(file.patch).slice(0, maxPatchCharacters) : undefined
    }))
  }
}
