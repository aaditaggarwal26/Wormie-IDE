import { describe, expect, it } from 'vitest'
import type { DomainMasteryView, MasteryConceptView, MasteryOverviewView, ReviewQueueItem } from '@shared/contracts'
import {
  emptyProfileMessage,
  filterConcepts,
  growthLabel,
  masteryPercent,
  reviewRiskLabel,
  sortConcepts,
  sortDomains
} from './masteryProfileModel'

function concept(overrides: Partial<MasteryConceptView>): MasteryConceptView {
  return {
    conceptId: overrides.conceptId ?? 'concept',
    name: overrides.name ?? 'Concept',
    description: '',
    domain: overrides.domain ?? 'javascript',
    depth: overrides.depth ?? 'foundation',
    mastery: overrides.mastery ?? 0,
    confidence: overrides.confidence ?? 0,
    status: overrides.status ?? 'unassessed',
    lastAssessedAt: overrides.lastAssessedAt ?? null,
    nextReviewAt: overrides.nextReviewAt ?? null
  }
}

function overview(overrides: Partial<MasteryOverviewView>): MasteryOverviewView {
  return {
    overallMastery: null,
    overallConfidence: 0,
    assessedConcepts: 0,
    unassessedConcepts: 48,
    reviewDueConcepts: 0,
    statusCounts: { unassessed: 48, learning: 0, weak: 0, developing: 0, proficient: 0, strong: 0, review_due: 0 },
    strongConcepts: [],
    weakConcepts: [],
    reviewDue: [],
    recentImprovements: [],
    recentRegressions: [],
    estimatedGrowth: null,
    gamification: { totalXp: 0, level: 1, dailyStreak: 0, weeklyStreak: 0 },
    ...overrides
  }
}

describe('mastery profile model', () => {
  it('keeps empty profiles honest instead of inventing a mastery score', () => {
    const model = overview({})
    expect(masteryPercent(model.overallMastery)).toBe('No signal')
    expect(emptyProfileMessage(model)).toContain('No mastery estimate yet')
  })

  it('filters concept lists by learner-facing status groups', () => {
    const concepts = [
      concept({ conceptId: 'a', status: 'weak' }),
      concept({ conceptId: 'b', status: 'review_due' }),
      concept({ conceptId: 'c', status: 'strong' })
    ]
    expect(filterConcepts(concepts, 'weak').map((item) => item.conceptId)).toEqual(['a'])
    expect(filterConcepts(concepts, 'review').map((item) => item.conceptId)).toEqual(['b'])
    expect(filterConcepts(concepts, 'strong').map((item) => item.conceptId)).toEqual(['c'])
  })

  it('sorts priority concepts by review pressure and weak mastery', () => {
    const sorted = sortConcepts([
      concept({ conceptId: 'strong', mastery: 92, confidence: 0.8, status: 'strong' }),
      concept({ conceptId: 'weak', mastery: 45, confidence: 0.7, status: 'weak' }),
      concept({ conceptId: 'due', mastery: 78, confidence: 0.8, status: 'review_due' })
    ], 'priority')
    expect(sorted.map((item) => item.conceptId)).toEqual(['due', 'weak', 'strong'])
  })

  it('orders domains by actionability before raw mastery', () => {
    const domains: DomainMasteryView[] = [
      { domain: 'testing', mastery: 92, confidence: 0.8, assessedConcepts: 2, totalConcepts: 2, weakConcepts: 0, strongConcepts: 2, reviewDueConcepts: 0 },
      { domain: 'authentication', mastery: 64, confidence: 0.5, assessedConcepts: 1, totalConcepts: 3, weakConcepts: 1, strongConcepts: 0, reviewDueConcepts: 1 },
      { domain: 'typescript', mastery: null, confidence: 0, assessedConcepts: 0, totalConcepts: 4, weakConcepts: 0, strongConcepts: 0, reviewDueConcepts: 0 }
    ]
    expect(sortDomains(domains).map((item) => item.domain)).toEqual(['authentication', 'testing', 'typescript'])
  })

  it('formats growth and review risk without overstating certainty', () => {
    expect(growthLabel(overview({ estimatedGrowth: { pointsPer30Days: 6, evidenceWindowDays: 30 } }))).toBe('+6 pts / 30 days')
    expect(growthLabel(overview({ estimatedGrowth: null }))).toContain('appears after')
    expect(reviewRiskLabel({ concept: concept({}), overdueDays: 4, forgottenRisk: 0.8, review: {} as ReviewQueueItem['review'] })).toBe('high drift risk')
  })
})
