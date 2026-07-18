import { describe, expect, it } from 'vitest'
import { isCurrentWorkspaceResponse } from './workspaceResponse'

describe('workspace response identity', () => {
  it('rejects a response from an old workspace', () => {
    expect(isCurrentWorkspaceResponse('/repo/current', '/repo/old')).toBe(false)
    expect(isCurrentWorkspaceResponse('/repo/current', '/repo/current')).toBe(true)
  })
})
