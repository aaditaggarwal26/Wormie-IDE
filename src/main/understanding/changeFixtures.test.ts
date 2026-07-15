import { describe, expect, it } from 'vitest'
import { developmentChangeFixtures } from './changeFixtures'
import { classifyChange, defaultUnderstandingSettings } from './significance'

describe('development change fixtures', () => {
  it('cover the required realistic change families without shipping runtime demo data', () => {
    expect(Object.keys(developmentChangeFixtures)).toEqual(['smallText', 'reactState', 'authentication', 'databaseMigration', 'electronIpc', 'largeRefactor', 'criticalFileAccess'])
    expect(classifyChange(developmentChangeFixtures.smallText, defaultUnderstandingSettings).quizRequired).toBe(false)
    expect(classifyChange(developmentChangeFixtures.authentication, defaultUnderstandingSettings).quizRequired).toBe(true)
    expect(classifyChange(developmentChangeFixtures.criticalFileAccess, defaultUnderstandingSettings).level).toBe('critical')
  })
})
