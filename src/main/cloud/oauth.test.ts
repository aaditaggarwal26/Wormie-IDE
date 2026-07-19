import { describe, expect, it } from 'vitest'
import { authCallback, authCallbackFromArguments, authTokensFromLink } from './oauth'

describe('authCallback', () => {
  it('accepts only the Wormie OAuth callback route', () => {
    expect(authCallback('wormie-ide://auth/callback?code=one-time-code')).toEqual({
      kind: 'code',
      code: 'one-time-code',
      recovery: false
    })
    expect(authCallback('wormie://auth/callback?error=access_denied')).toEqual({ kind: 'error' })
    expect(authCallback('wormie://join/callback?code=one-time-code')).toBeNull()
    expect(authCallback('https://auth/callback?code=one-time-code')).toBeNull()
    expect(authCallback('wormie://auth/callback?code=one&code=two')).toBeNull()
  })

  it('marks password recovery callbacks so the reset screen can be shown', () => {
    expect(authCallback('wormie-ide://auth/callback?flow=recovery&code=reset-code')).toEqual({
      kind: 'code',
      code: 'reset-code',
      recovery: true
    })
    // A non-recovery sign-in callback is not treated as a reset.
    expect(authCallback('wormie-ide://auth/callback?flow=other&code=sign-in-code')).toEqual({
      kind: 'code',
      code: 'sign-in-code',
      recovery: false
    })
  })

  it('finds a callback in desktop launch arguments', () => {
    expect(authCallbackFromArguments(['wormie', '--flag', 'wormie-ide://auth/callback?code=test'])).toEqual({
      kind: 'code',
      code: 'test',
      recovery: false
    })
  })
})

describe('authTokensFromLink', () => {
  it('reads implicit-flow tokens from a Site-URL fallback link', () => {
    expect(authTokensFromLink('http://localhost:3000/#access_token=abc&refresh_token=xyz&type=magiclink')).toEqual({
      accessToken: 'abc',
      refreshToken: 'xyz',
      recovery: false
    })
  })

  it('flags recovery-type implicit links so the reset screen can be shown', () => {
    expect(authTokensFromLink('http://localhost:3000/#access_token=abc&refresh_token=xyz&type=recovery')).toEqual({
      accessToken: 'abc',
      refreshToken: 'xyz',
      recovery: true
    })
  })

  it('rejects links without both tokens', () => {
    expect(authTokensFromLink('http://localhost:3000/#access_token=abc')).toBeNull()
    expect(authTokensFromLink('http://localhost:3000/?code=abc')).toBeNull()
    expect(authTokensFromLink('not a url')).toBeNull()
  })
})
