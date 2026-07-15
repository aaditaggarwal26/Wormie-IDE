import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function createRendererUrlValidator(
  developmentUrl: string | undefined,
  rendererFilePath: string
): (candidateUrl: string) => boolean {
  const expectedDevelopmentOrigin = developmentUrl ? new URL(developmentUrl).origin : null
  const expectedFilePath = path.resolve(rendererFilePath)

  return (candidateUrl) => {
    try {
      const candidate = new URL(candidateUrl)
      if (expectedDevelopmentOrigin) return candidate.origin === expectedDevelopmentOrigin
      if (candidate.protocol !== 'file:') return false
      return path.resolve(fileURLToPath(candidate)) === expectedFilePath
    } catch {
      return false
    }
  }
}
