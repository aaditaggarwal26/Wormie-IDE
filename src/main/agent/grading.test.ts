import { describe, expect, it } from 'vitest'
import { gradeQuiz } from './grading'

const key = [
  { questionId: 'q1', correctOption: 1, explanation: 'One' },
  { questionId: 'q2', correctOption: 0, explanation: 'Two' },
  { questionId: 'q3', correctOption: 2, explanation: 'Three' }
]

describe('gradeQuiz', () => {
  it('unlocks only at the server-owned threshold', () => {
    const result = gradeQuiz({ sessionId: 'session', answers: { q1: 1, q2: 0, q3: 1 } }, key, 60)
    expect(result.score).toBe(67)
    expect(result.passed).toBe(true)
  })

  it('treats missing answers as incorrect', () => {
    const result = gradeQuiz({ sessionId: 'session', answers: {} }, key, 60)
    expect(result.score).toBe(0)
    expect(result.passed).toBe(false)
  })
})
