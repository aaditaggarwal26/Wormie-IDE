import { describe, expect, it } from 'vitest'
import { rankFiles } from './fuzzy'

const files = [
  { path: '/repo/src/components/UserCard.tsx', relativePath: 'src/components/UserCard.tsx', name: 'UserCard.tsx' },
  { path: '/repo/src/user/card.ts', relativePath: 'src/user/card.ts', name: 'card.ts' },
  { path: '/repo/docs/user-card.md', relativePath: 'docs/user-card.md', name: 'user-card.md' }
]

describe('rankFiles', () => {
  it('prioritizes filename matches over directory-only matches', () => {
    const results = rankFiles('user', files)
    expect(results.map((result) => result.file.name)).toEqual(['user-card.md', 'UserCard.tsx', 'card.ts'])
  })

  it('returns relative-path character positions for highlighting', () => {
    const [result] = rankFiles('uc', files)
    expect(result.file.name).toBe('UserCard.tsx')
    expect(result.matchIndexes.map((index) => result.file.relativePath[index]).join('').toLowerCase()).toBe('uc')
  })

  it('returns no result when the query is not a subsequence', () => {
    expect(rankFiles('zzzz', files)).toEqual([])
  })
})
