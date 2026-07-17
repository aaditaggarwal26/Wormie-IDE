import { describe, expect, it } from 'vitest'
import { isLoopbackUrl, schemaSummary, validateBaseUrl } from './provider'

describe('validateBaseUrl', () => {
  it('accepts HTTPS providers and strips the trailing slash', () => {
    expect(validateBaseUrl('https://api.example.com/v1/')).toBe('https://api.example.com/v1')
  })

  it('allows HTTP only for a loopback model server', () => {
    expect(validateBaseUrl('http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1')
    expect(isLoopbackUrl('http://localhost:1234/v1')).toBe(true)
    expect(() => validateBaseUrl('http://api.example.com/v1')).toThrow(/HTTPS/)
  })

  it('rejects embedded credentials and query parameters', () => {
    expect(() => validateBaseUrl('https://user:pass@api.example.com/v1')).toThrow(/credentials/)
    expect(() => validateBaseUrl('https://api.example.com/v1?key=secret')).toThrow(/query/)
  })
})

describe('proposal output contract', () => {
  it('tells OpenAI-compatible models to use edits only for updates', () => {
    const summary = schemaSummary('proposal')
    expect(summary).toContain('"edits"?: [{ "oldText": string, "newText": string }]')
    expect(summary).toContain('For action "create", content is required and edits must be omitted.')
    expect(summary).toContain('For action "update", edits are required and content must be omitted.')
  })
})
