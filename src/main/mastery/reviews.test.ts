import { describe, expect, it } from 'vitest'
import { forgottenTopicRisk, scheduleReview } from './reviews'

const NOW = '2026-07-19T12:00:00.000Z'

describe('spaced reviews', () => {
  it('uses confidence-aware first intervals and grows them after success', () => {
    const low = scheduleReview(null, { score: 1, confidence: 0.2, occurredAt: NOW })
    const high = scheduleReview(null, { score: 1, confidence: 0.9, occurredAt: NOW })
    expect(high.intervalDays).toBeGreaterThan(low.intervalDays)
    expect(scheduleReview(high, { score: 1, confidence: 0.9, occurredAt: '2026-07-24T12:00:00.000Z' }).intervalDays).toBeGreaterThan(high.intervalDays)
  })

  it('resets intervals and increments lapses after failure', () => {
    const current = scheduleReview(null, { score: 1, confidence: 0.8, occurredAt: NOW })
    const failed = scheduleReview(current, { score: 0, confidence: 0.8, occurredAt: '2026-07-25T12:00:00.000Z' })
    expect(failed.intervalDays).toBe(1)
    expect(failed.lapseCount).toBe(1)
    expect(failed.lastOutcome).toBe('failed')
  })

  it('calculates deterministic overdue forgotten-topic risk', () => {
    const review = scheduleReview(null, { score: 1, confidence: 0.5, occurredAt: NOW })
    expect(forgottenTopicRisk(review, review.nextReviewAt).risk).toBeLessThan(forgottenTopicRisk(review, '2026-08-19T12:00:00.000Z').risk)
  })
})
