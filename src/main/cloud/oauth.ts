export type AuthCallback =
  | { kind: 'code'; code: string }
  | { kind: 'error' }

export const authCallbackUrl = 'wormie-ide://auth/callback'

export function authCallback(value: string): AuthCallback | null {
  try {
    const url = new URL(value)
    if (
      !['wormie:', 'wormie-ide:'].includes(url.protocol) ||
      url.hostname !== 'auth' ||
      url.pathname !== '/callback' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash
    ) return null

    if (url.searchParams.has('error')) return { kind: 'error' }
    const codes = url.searchParams.getAll('code')
    if (codes.length !== 1 || codes[0].length === 0 || codes[0].length > 2048) return null
    return { kind: 'code', code: codes[0] }
  } catch {
    return null
  }
}

export function authCallbackFromArguments(argumentsList: string[]): AuthCallback | null {
  for (const argument of argumentsList) {
    const callback = authCallback(argument)
    if (callback) return callback
  }
  return null
}
