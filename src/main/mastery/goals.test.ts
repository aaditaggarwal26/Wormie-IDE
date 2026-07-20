import { describe, expect, it } from 'vitest'
import { createGoal, progressGoals } from './goals'

describe('learning goals', () => {
  it('validates goals and advances matching events without exceeding the target', () => {
    const goal = createGoal({ id: 'goal-1', title: 'Complete reviews', type: 'reviews', target: 2 }, '2026-07-19T12:00:00.000Z')
    const once = progressGoals({ [goal.id]: goal }, { type: 'review', amount: 1 }, '2026-07-20T12:00:00.000Z')
    const done = progressGoals(once, { type: 'review', amount: 5 }, '2026-07-21T12:00:00.000Z')
    expect(done[goal.id].progress).toBe(2)
    expect(done[goal.id].status).toBe('completed')
    expect(() => createGoal({ id: 'bad', title: '', type: 'xp', target: 0 }, '2026-07-19T12:00:00.000Z')).toThrow()
  })
})
