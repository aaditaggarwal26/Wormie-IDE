export type AuthCallback =
  | { kind: 'code'; code: string; recovery: boolean }
  | { kind: 'error' }

export const authCallbackUrl = 'wormie-ide://auth/callback'
// Password recovery links reuse the callback route but carry a marker so the
// exchange can surface the "set a new password" screen. Supabase's PKCE flow
// redirects with `?code=...` only and drops `type=recovery`, and with
// `detectSessionInUrl: false` the PASSWORD_RECOVERY event never fires — so the
// recovery intent has to ride along on the redirect URL we control.
export const passwordResetCallbackUrl = 'wormie-ide://auth/callback?flow=recovery'

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
    return { kind: 'code', code: codes[0], recovery: url.searchParams.get('flow') === 'recovery' }
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

export type AuthTokens = { accessToken: string; refreshToken: string; recovery: boolean }

// Implicit-flow links (magic links, and any link that falls back to the Site URL
// because it carries no redirectTo) deliver the session as a URL hash fragment:
//   http://localhost:3000/#access_token=...&refresh_token=...&type=recovery
// The deep-link path rejects hashes on purpose — a hostile web page can invoke
// wormie-ide:// — but this is only used for the user-pasted recovery link, where
// the user is knowingly supplying their own token, so we accept it here.
export function authTokensFromLink(value: string): AuthTokens | null {
  try {
    const url = new URL(value)
    const hash = url.hash.startsWith('#') ? url.hash.slice(1) : url.hash
    if (!hash) return null
    const params = new URLSearchParams(hash)
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (!accessToken || accessToken.length > 4096) return null
    if (!refreshToken || refreshToken.length > 512) return null
    return { accessToken, refreshToken, recovery: params.get('type') === 'recovery' }
  } catch {
    return null
  }
}
