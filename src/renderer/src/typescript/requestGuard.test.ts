import { describe, expect, it, vi } from 'vitest'
import { isCurrentWorkspaceRequest, withRequestTimeout } from './requestGuard'

describe('language request guard', () => {
  it('rejects stale workspace generations', () => {
    expect(isCurrentWorkspaceRequest('C:/one', 3, 'C:/one', 3)).toBe(true)
    expect(isCurrentWorkspaceRequest('C:/one', 3, 'C:/two', 3)).toBe(false)
    expect(isCurrentWorkspaceRequest('C:/one', 3, 'C:/one', 4)).toBe(false)
  })

  it('times out failed language requests', async () => {
    vi.useFakeTimers()
    const pending = withRequestTimeout(new Promise<string>(() => undefined), 100, 'Language request timed out.')
    const assertion = expect(pending).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(100)
    await assertion
    vi.useRealTimers()
  })
})
