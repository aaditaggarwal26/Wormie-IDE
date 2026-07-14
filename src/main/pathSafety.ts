import path from 'node:path'

export function isPathInside(rootPath: string, candidatePath: string): boolean {
  const relative = path.relative(rootPath, candidatePath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function validateEntryName(name: string): string {
  if (typeof name !== 'string') throw new Error('Enter a valid file or folder name.')
  const trimmedName = name.trim()
  if (!trimmedName || trimmedName === '.' || trimmedName === '..') {
    throw new Error('Enter a valid file or folder name.')
  }
  if (/[<>:"/\\|?*\x00-\x1F]/.test(trimmedName)) {
    throw new Error('The name contains characters that are not supported across platforms.')
  }
  return trimmedName
}
