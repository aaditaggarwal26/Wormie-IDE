export function canPersistAuthSession(
  platform: NodeJS.Platform,
  encryptionAvailable: boolean,
  linuxBackend?: string
): boolean {
  if (!encryptionAvailable) return false
  return platform !== 'linux' || (linuxBackend !== 'basic_text' && linuxBackend !== 'unknown')
}
