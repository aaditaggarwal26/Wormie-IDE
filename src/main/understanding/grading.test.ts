import { describe, expect, it } from 'vitest'
import type { PrivateQuizQuestion, UnderstandingAnswer } from '../../shared/contracts'
import { gradeDeterministicAnswers, toPublicQuestion } from './grading'

const questions: PrivateQuizQuestion[] = [
  { id: 'single', type: 'multiple_choice', conceptId: 'flow', prompt: 'Pick one', options: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], correctAnswer: 'b', explanation: 'B', difficulty: 'easy', sourceReferences: [], weight: 1 },
  { id: 'multi', type: 'multiple_select', conceptId: 'risk', prompt: 'Pick all', options: [{ id: 'a', label: 'A' }, { id: 'c', label: 'C' }], correctAnswer: ['a', 'c'], explanation: 'Both', difficulty: 'medium', sourceReferences: [], weight: 2 },
  { id: 'bool', type: 'true_false', conceptId: 'security', prompt: 'True?', correctAnswer: true, explanation: 'True', difficulty: 'hard', sourceReferences: [], weight: 2 }
]

describe('gradeDeterministicAnswers', () => {
  it('grades exact answer formats and calculates a weighted score', () => {
    const answers: Record<string, UnderstandingAnswer> = {
      single: { value: 'b' }, multi: { value: ['c', 'a'] }, bool: { value: false }
    }
    const result = gradeDeterministicAnswers(questions, answers)
    expect(result.score).toBe(60)
    expect(result.feedback.find((item) => item.questionId === 'multi')?.correct).toBe(true)
  })

  it('leaves short answers pending for trusted semantic grading', () => {
    const open: PrivateQuizQuestion = { id: 'open', type: 'short_answer', conceptId: 'flow', prompt: 'Explain', correctAnswer: 'rubric', explanation: 'Why', difficulty: 'hard', sourceReferences: [], weight: 2 }
    const result = gradeDeterministicAnswers([open], { open: { value: 'Because cleanup runs first.' } })
    expect(result.pendingQuestionIds).toEqual(['open'])
    expect(result.score).toBe(0)
  })

  it('projects renderer questions without answer keys or rubrics', () => {
    const projected = toPublicQuestion(questions[0])
    expect(projected).not.toHaveProperty('correctAnswer')
    expect(projected).not.toHaveProperty('explanation')
    expect(projected).not.toHaveProperty('weight')
  })
})
