import { describe, expect, it } from 'vitest'
import { migrateMasteryState } from './migrations'

const NOW = '2026-07-19T12:00:00.000Z'

describe('mastery migrations', () => {
  it('imports legacy mastery without treating it as high-confidence current evidence', () => {
    const migrated = migrateMasteryState(undefined, [{
      conceptId: 'auth', name: 'JWTs', mastery: 74, attempts: 5, correct: 4,
      updatedAt: '2026-07-01T00:00:00.000Z', evidenceQuizIds: ['quiz-1', 'quiz-2']
    }], NOW)
    const evidence = Object.values(migrated.profile.evidence)
    expect(evidence).toHaveLength(2)
    expect(evidence.every((item) => item.conceptId === 'authentication.tokens')).toBe(true)
    expect(evidence.every((item) => item.source === 'legacy_import')).toBe(true)
    expect(migrated.profile.concepts['authentication.tokens'].confidence).toBeLessThan(0.35)
  })

  it('normalizes corrupt restored records instead of shallowly trusting them', () => {
    const migrated = migrateMasteryState({ schemaVersion: 1, profile: { evidence: { bad: { id: 12 } }, concepts: null } }, [], NOW)
    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.profile.evidence).toEqual({})
    expect(migrated.profile.concepts).toEqual({})
  })
})
