import { describe, expect, it, vi } from 'vitest'
import { MASTERY_UPDATED_EVENT, masteryQueryKeys, notifyMasteryUpdated } from './useMasteryProfile'

describe('mastery profile query keys', () => {
  it('groups all profile surfaces under one invalidation root', () => {
    expect(masteryQueryKeys.overview()[0]).toBe('mastery')
    expect(masteryQueryKeys.concept('react-state').slice(0, 2)).toEqual(['mastery', 'concept'])
    expect(masteryQueryKeys.sync()).toEqual(['mastery', 'sync'])
  })

  it('emits a stable refresh event for learning flows', () => {
    const dispatchEvent = vi.fn()
    vi.stubGlobal('window', { dispatchEvent })
    notifyMasteryUpdated()
    vi.unstubAllGlobals()
    expect(dispatchEvent).toHaveBeenCalledTimes(1)
    expect(dispatchEvent.mock.calls[0]?.[0]).toMatchObject({ type: MASTERY_UPDATED_EVENT })
  })
})
