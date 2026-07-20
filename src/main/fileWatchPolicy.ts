export function validateWatchFilePaths(value: unknown): string[] {
  if (!Array.isArray(value) || value.length > 30) throw new Error('The open-file watch list is invalid.')
  if (value.some((filePath) => typeof filePath !== 'string' || filePath.length === 0 || filePath.length > 2_000)) {
    throw new Error('The open-file watch list is invalid.')
  }
  return [...new Set(value)]
}
