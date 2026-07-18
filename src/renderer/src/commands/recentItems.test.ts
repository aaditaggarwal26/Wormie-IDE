import { describe, expect, it } from 'vitest'
import { parseRecentItems, pushRecentItem } from './recentItems'

describe('recent items', () => {
  it('ignores corrupt and outdated persistence', () => {
    expect(parseRecentItems('{bad json')).toEqual({ version: 1, files: [], commands: [] })
    expect(parseRecentItems(JSON.stringify({ version: 99, files: ['/repo/a.ts'], commands: [] }))).toEqual({
      version: 1,
      files: [],
      commands: []
    })
  })

  it('deduplicates and bounds recent entries', () => {
    expect(pushRecentItem(['a', 'b', 'c'], 'b', 3)).toEqual(['b', 'a', 'c'])
    expect(pushRecentItem(['a', 'b', 'c'], 'd', 3)).toEqual(['d', 'a', 'b'])
  })
})
