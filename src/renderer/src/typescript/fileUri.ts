export function workspacePathToFileUri(filePath: string, platform: string): string {
  if (typeof filePath !== 'string' || filePath.length === 0) throw new Error('A file path is required.')
  const normalized = filePath.replace(/\\/g, '/')
  const encodePath = (value: string) => value.split('/').map((segment, index) => {
    const encoded = encodeURIComponent(segment)
    return platform === 'win32' && index === 1 && /^[A-Za-z]:$/.test(segment) ? encoded.replace('%3A', ':') : encoded
  }).join('/')
  if (platform === 'win32' && normalized.startsWith('//')) {
    const [host, ...parts] = normalized.slice(2).split('/')
    return `file://${host}/${encodePath(parts.join('/'))}`
  }
  const pathname = normalized.startsWith('/') ? normalized : `/${normalized}`
  return `file://${encodePath(pathname)}`
}

export function fileUriToPath(uri: string, platform: string): string {
  let parsed: URL
  try {
    parsed = new URL(uri)
  } catch {
    throw new Error('The language service returned an invalid file URI.')
  }
  if (parsed.protocol !== 'file:') throw new Error('The language service returned a non-file URI.')
  const pathname = decodeURIComponent(parsed.pathname)
  if (platform === 'win32') {
    if (parsed.hostname) return `\\\\${parsed.hostname}${pathname.replace(/\//g, '\\')}`
    return pathname.replace(/^\/([A-Za-z]:)/, '$1').replace(/\//g, '\\')
  }
  return pathname
}

export function isWorkspaceFilePath(workspaceRoot: string, filePath: string, platform: string): boolean {
  const normalize = (value: string) => {
    const portable = value.replace(/\\/g, '/')
    const prefix = portable.startsWith('//') ? '//' : portable.startsWith('/') ? '/' : ''
    const parts: string[] = []
    for (const part of portable.split('/')) {
      if (!part || part === '.') continue
      if (part === '..') parts.pop()
      else parts.push(part)
    }
    const normalized = `${prefix}${parts.join('/')}`.replace(/\/$/, '')
    return platform === 'win32' ? normalized.toLocaleLowerCase() : normalized
  }
  const root = normalize(workspaceRoot)
  const candidate = normalize(filePath)
  return candidate === root || candidate.startsWith(`${root}/`)
}
