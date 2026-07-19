import { describe, expect, it } from 'vitest'
import { activityIdsForMode } from './activityItems'

describe('IDE activity rail modes', () => {
  it('keeps education management out of Sandbox mode', () => {
    const ids = activityIdsForMode(false)
    expect(ids).toEqual(['explorer', 'search', 'outline', 'sourceControl'])
  })

  it('adds only assignment context in Assignment mode', () => {
    const ids = activityIdsForMode(true)
    expect(ids).toEqual(['explorer', 'search', 'outline', 'sourceControl', 'assignments'])
  })
})
