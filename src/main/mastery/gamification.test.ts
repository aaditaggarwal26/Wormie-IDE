import { describe, expect, it } from 'vitest'
import { applyRewardEvent, createEmptyGamification } from './gamification'

describe('learning rewards', () => {
  it('awards difficulty-aware XP idempotently and records perfect-score reasons', () => {
    const event = { id: 'event-1', evidenceId: 'e1', type: 'evidence' as const, occurredAt: '2026-07-19T12:00:00.000Z', score: 1, difficulty: 'hard' as const, format: 'short_answer' as const, attempt: 1, conceptId: 'ipc.validation' }
    const first = applyRewardEvent(createEmptyGamification(), event)
    const replayed = applyRewardEvent(first, event)
    expect(replayed).toEqual(first)
    expect(first.totalXp).toBeGreaterThan(20)
    expect(Object.values(first.awards).some((award) => award.ruleId === 'perfect-score' && award.reason.includes('Perfect'))).toBe(true)
  })

  it('awards nothing for bypasses, failures, or repeated easy attempts', () => {
    const empty = createEmptyGamification()
    expect(applyRewardEvent(empty, { id: 'b', type: 'bypass', occurredAt: '2026-07-19T12:00:00.000Z' })).toEqual(empty)
    expect(applyRewardEvent(empty, { id: 'f', evidenceId: 'e', type: 'evidence', occurredAt: '2026-07-19T12:00:00.000Z', score: 0, difficulty: 'easy', format: 'multiple_choice', attempt: 1 })).toEqual(empty)
    expect(applyRewardEvent(empty, { id: 'r', evidenceId: 'e2', type: 'evidence', occurredAt: '2026-07-19T12:00:00.000Z', score: 1, difficulty: 'easy', format: 'multiple_choice', attempt: 2 })).toEqual(empty)
  })

  it('calculates daily and weekly streaks from qualifying calendar dates', () => {
    let state = createEmptyGamification()
    state = applyRewardEvent(state, { id: 'd1', type: 'review_completed', occurredAt: '2026-07-18T12:00:00.000Z' })
    state = applyRewardEvent(state, { id: 'd2', type: 'review_completed', occurredAt: '2026-07-19T12:00:00.000Z' })
    expect(state.dailyStreak).toBe(2)
    expect(state.weeklyStreak).toBeGreaterThanOrEqual(1)
  })
})
