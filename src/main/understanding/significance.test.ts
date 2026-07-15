import { describe, expect, it } from 'vitest'
import type { ChangeInput, UnderstandingSettings } from '../../shared/contracts'
import { classifyChange, defaultUnderstandingSettings } from './significance'

const input = (overrides: Partial<ChangeInput> = {}): ChangeInput => ({
  id: 'change-1',
  source: 'ai_proposal',
  title: 'Update copy',
  files: [{ path: 'src/App.tsx', status: 'modified', additions: 1, deletions: 1, patch: '-old\n+new' }],
  ...overrides
})

describe('classifyChange', () => {
  it('keeps a tiny isolated text change below the default gate', () => {
    const result = classifyChange(input(), defaultUnderstandingSettings)
    expect(result.level).toBe('trivial')
    expect(result.quizRequired).toBe(false)
  })

  it('classifies authentication changes as major without relying on line count', () => {
    const result = classifyChange(input({
      title: 'Rotate session cookies',
      files: [{ path: 'src/auth/session.ts', status: 'modified', additions: 4, deletions: 2, patch: '+httpOnly: true\n+sameSite: strict' }]
    }), defaultUnderstandingSettings)
    expect(result.level).toBe('major')
    expect(result.riskFactors).toContain('authentication')
    expect(result.quizRequired).toBe(true)
    expect(result.triggerReasons.join(' ')).toMatch(/authentication/i)
  })

  it('raises security-sensitive Electron IPC and filesystem changes to critical', () => {
    const result = classifyChange(input({
      files: [
        { path: 'src/preload/index.ts', status: 'modified', additions: 20, deletions: 2, patch: '+ipcRenderer.invoke("file:write")' },
        { path: 'src/main/files.ts', status: 'added', additions: 40, deletions: 0, patch: '+fs.writeFile(path, value)' }
      ]
    }), defaultUnderstandingSettings)
    expect(result.riskFactors).toEqual(expect.arrayContaining(['electron_ipc', 'filesystem_access', 'security_boundary']))
    expect(result.level).toBe('critical')
    expect(result.recommendedQuizDepth).toBe('deep')
  })

  it('respects the configured minor trigger threshold', () => {
    const settings: UnderstandingSettings = { ...defaultUnderstandingSettings, triggerLevel: 'minor' }
    const result = classifyChange(input({
      files: [
        { path: 'src/a.ts', status: 'modified', additions: 45, deletions: 10, patch: '' },
        { path: 'src/b.ts', status: 'modified', additions: 25, deletions: 5, patch: '' }
      ]
    }), settings)
    expect(result.level).toBe('minor')
    expect(result.quizRequired).toBe(true)
  })
})
