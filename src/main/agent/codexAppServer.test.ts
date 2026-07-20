import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { CodexAppServer, isAuthTurnError, restrictedThreadConfig, resolveCodexExecutable } from './codexAppServer'

const temporaryHomes: string[] = []

afterEach(async () => {
  await Promise.all(temporaryHomes.splice(0).map((directory) => fs.rm(directory, {
    recursive: true,
    force: true,
    maxRetries: 8,
    retryDelay: 100
  })))
})

describe('Codex app-server integration', () => {
  it('disables web search without sending an invalid nested tool value', () => {
    expect(restrictedThreadConfig.web_search).toBe('disabled')
    expect(restrictedThreadConfig).not.toHaveProperty('tools.web_search')
  })

  it('classifies auth-related turn failures for the refresh retry', () => {
    expect(isAuthTurnError('Request failed with status 401')).toBe(true)
    expect(isAuthTurnError('403 Forbidden')).toBe(true)
    expect(isAuthTurnError('Unauthorized request')).toBe(true)
    expect(isAuthTurnError('The access token expired')).toBe(true)
    expect(isAuthTurnError('invalid_token provided by client')).toBe(true)
    expect(isAuthTurnError('Please re-authenticate with ChatGPT')).toBe(true)

    expect(isAuthTurnError('Request failed with status 400')).toBe(false)
    expect(isAuthTurnError('The model returned malformed JSON')).toBe(false)
    expect(isAuthTurnError('Codex turn ended with status failed.')).toBe(false)
  })

  it('resolves the bundled native runtime', () => {
    expect(existsSync(resolveCodexExecutable())).toBe(true)
  })

  it('starts with an isolated profile and completes the account handshake', async () => {
    const codexHome = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-codex-'))
    temporaryHomes.push(codexHome)
    const runtime = new CodexAppServer(codexHome)

    try {
      const status = await runtime.getAccountStatus()
      expect(status.available, status.error).toBe(true)
      expect(typeof status.connected).toBe('boolean')

      const models = await runtime.listModels()
      expect(models.length).toBeGreaterThan(0)
      expect(models[0]).toMatchObject({ id: expect.any(String), displayName: expect.any(String) })

      const config = await fs.readFile(path.join(codexHome, 'config.toml'), 'utf8')
      expect(config).toContain('approval_policy = "never"')
      expect(config).toContain('sandbox_mode = "read-only"')
      expect(config).toContain('shell_tool = false')
      expect(config).toContain('remote_plugin = false')
    } finally {
      await runtime.stop()
    }
  }, 30_000)
})
