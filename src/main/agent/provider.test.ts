import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { CodexAppServer } from './codexAppServer'
import { isLoopbackUrl, listOpenAICompatibleModels, ModelGateway, schemaSummary, validateBaseUrl } from './provider'
import { remediationDraftSchema } from './schemas'

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

describe('structured output fallback', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('falls back to prose-shape prompting when the provider rejects json_schema', async () => {
    const requestBodies: string[] = []
    vi.stubGlobal('fetch', async (_url: unknown, init?: { body?: unknown }) => {
      const body = typeof init?.body === 'string' ? init.body : ''
      requestBodies.push(body)
      if (body.includes('response_format')) {
        return new Response(JSON.stringify({ error: { message: 'response_format is not supported' } }), {
          status: 400,
          headers: { 'content-type': 'application/json' }
        })
      }
      return new Response(JSON.stringify({
        id: 'test', object: 'chat.completion', created: 0, model: 'test-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '{"lesson":"Practice smaller edits."}' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    const gateway = new ModelGateway({
      provider: 'openai-compatible',
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:9/v1',
      hasApiKey: false,
      keyStorage: 'none',
      passingScore: 80
    }, null, {} as CodexAppServer)

    const result = await gateway.generateStructured(
      'remediation',
      'Write a short remediation lesson.',
      remediationDraftSchema,
      new AbortController().signal
    )
    expect(result).toEqual({ lesson: 'Practice smaller edits.' })
    expect(requestBodies.some((body) => body.includes('response_format'))).toBe(true)
    expect(requestBodies.length).toBeGreaterThan(1)
  })

  it('sends attached screenshots as multimodal image parts', async () => {
    const imagePath = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-provider-test-')), 'shot.png')
    await fs.writeFile(imagePath, Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    const requestBodies: string[] = []
    vi.stubGlobal('fetch', async (_url: unknown, init?: { body?: unknown }) => {
      requestBodies.push(typeof init?.body === 'string' ? init.body : '')
      return new Response(JSON.stringify({
        id: 'test', object: 'chat.completion', created: 0, model: 'test-model',
        choices: [{
          index: 0,
          message: { role: 'assistant', content: '{"lesson":"Look at the screenshot."}' },
          finish_reason: 'stop'
        }],
        usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 }
      }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    const gateway = new ModelGateway({
      provider: 'openai-compatible',
      model: 'test-model',
      baseUrl: 'http://127.0.0.1:9/v1',
      hasApiKey: false,
      keyStorage: 'none',
      passingScore: 80
    }, null, {} as CodexAppServer)

    try {
      const result = await gateway.generateStructured(
        'remediation',
        'Explain what the screenshot shows.',
        remediationDraftSchema,
        new AbortController().signal,
        undefined,
        { imagePaths: [imagePath] }
      )
      expect(result).toEqual({ lesson: 'Look at the screenshot.' })
      expect(requestBodies[0]).toContain('image')
      expect(requestBodies[0]).toContain('image/png')
    } finally {
      await fs.rm(path.dirname(imagePath), { recursive: true, force: true })
    }
  })
})

describe('OpenAI-compatible model listing', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('loads, validates, and deduplicates provider model IDs', async () => {
    const requests: Array<{ url: unknown; authorization: string | null }> = []
    vi.stubGlobal('fetch', async (url: unknown, init?: RequestInit) => {
      requests.push({ url, authorization: new Headers(init?.headers).get('authorization') })
      return new Response(JSON.stringify({ data: [
        { id: 'model-b' }, { id: 'model-a' }, { id: 'model-b' }, { id: 'bad\nmodel' }, { nope: true }
      ] }), { status: 200, headers: { 'content-type': 'application/json' } })
    })

    await expect(listOpenAICompatibleModels('https://api.example.com/v1', 'secret')).resolves.toEqual([
      { id: 'model-b', displayName: 'model-b', description: '' },
      { id: 'model-a', displayName: 'model-a', description: '' }
    ])
    expect(requests).toEqual([{ url: 'https://api.example.com/v1/models', authorization: 'Bearer secret' }])
  })
})

describe('proposal output contract', () => {
  it('tells OpenAI-compatible models to use edits only for updates', () => {
    const summary = schemaSummary('proposal')
    expect(summary).toContain('"edits"?: [{ "oldText": string, "newText": string }]')
    expect(summary).toContain('For action "create", content is required and edits must be omitted.')
    expect(summary).toContain('For action "update", edits are required and content must be omitted.')
  })

  it('describes the read-only guidance response used by Ask and Plan modes', () => {
    expect(schemaSummary('guidance')).toContain('"nextSteps": [string]')
  })
})
