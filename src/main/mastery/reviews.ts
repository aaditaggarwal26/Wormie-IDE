import type { ReviewState } from '../../shared/contracts'

const DAY_MS = 86_400_000

export type ReviewOutcome = { score: number; confidence: number; occurredAt: string }

function addDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * DAY_MS).toISOString()
}

export function scheduleReview(current: ReviewState | null, raw: ReviewOutcome): ReviewState {
  const score = Math.max(0, Math.min(1, raw.score))
  const confidence = Math.max(0, Math.min(1, raw.confidence))
  const occurredAt = new Date(raw.occurredAt).toISOString()
  if (score < 0.6) {
    return {
      conceptId: current?.conceptId ?? '', nextReviewAt: addDays(occurredAt, 1), intervalDays: 1,
      ease: Math.max(1.3, (current?.ease ?? 2.3) - 0.2), stability: Math.max(0.5, (current?.stability ?? 1) * 0.55),
      lapseCount: (current?.lapseCount ?? 0) + 1, lastOutcome: 'failed', lastReviewedAt: occurredAt
    }
  }
  const firstInterval = Math.max(1, Math.round(2 + confidence * 3))
  const ease = Math.min(3, (current?.ease ?? 2.3) + (score >= 0.9 ? 0.1 : 0.03))
  const intervalDays = current
    ? Math.max(current.intervalDays + 1, Math.round(current.intervalDays * ease * (0.8 + confidence * 0.6) * (score >= 0.95 ? 1.15 : 1)))
    : firstInterval
  return {
    conceptId: current?.conceptId ?? '', nextReviewAt: addDays(occurredAt, intervalDays), intervalDays, ease,
    stability: (current?.stability ?? 1) + score * (1 + confidence), lapseCount: current?.lapseCount ?? 0,
    lastOutcome: score >= 0.8 ? 'passed' : 'partial', lastReviewedAt: occurredAt
  }
}

export function forgottenTopicRisk(review: ReviewState, now: string): { risk: number; overdueDays: number } {
  const overdueDays = Math.max(0, (Date.parse(now) - Date.parse(review.nextReviewAt)) / DAY_MS)
  const overdueFactor = overdueDays / Math.max(1, review.intervalDays)
  const stabilityFactor = 1 / Math.max(1, review.stability)
  return { risk: Math.min(1, Math.round((overdueFactor * 0.55 + stabilityFactor * 0.25 + review.lapseCount * 0.08) * 100) / 100), overdueDays: Math.round(overdueDays * 10) / 10 }
}
