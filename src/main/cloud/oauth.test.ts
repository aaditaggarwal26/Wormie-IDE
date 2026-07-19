import { describe, expect, it } from 'vitest'
import { authCallback, authCallbackFromArguments } from './oauth'

describe('authCallback', () => {
  it('accepts only the Wormie OAuth callback route', () => {
    expect(authCallback('wormie-ide://auth/callback?code=one-time-code')).toEqual({
      kind: 'code',
      code: 'one-time-code'
    })
    expect(authCallback('wormie://auth/callback?error=access_denied')).toEqual({ kind: 'error' })
    expect(authCallback('wormie://join/callback?code=one-time-code')).toBeNull()
    expect(authCallback('https://auth/callback?code=one-time-code')).toBeNull()
    expect(authCallback('wormie://auth/callback?code=one&code=two')).toBeNull()
  })

  it('finds a callback in desktop launch arguments', () => {
    expect(authCallbackFromArguments(['wormie', '--flag', 'wormie-ide://auth/callback?code=test'])).toEqual({
      kind: 'code',
      code: 'test'
    })
  })
})
