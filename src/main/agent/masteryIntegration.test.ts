import { describe, expect, it, vi } from 'vitest'
import { recordPrerequisiteQuizEvidence } from './masteryIntegration'

describe('prerequisite quiz mastery integration', () => {
  it('records question-level canonical evidence after grading', () => {
    const recordAssessment = vi.fn(() => ({ acceptedEvidenceIds: ['e1'], conceptIds: ['ipc.validation'] }))
    recordPrerequisiteQuizEvidence({ recordAssessment }, 'session-1', 2, {
      score: 50, passed: false,
      feedback: [{ questionId: 'q1', correct: true, explanation: 'Good' }, { questionId: 'q2', correct: false, explanation: 'Review' }]
    }, [
      { questionId: 'q1', correctOption: 0, explanation: 'Good', conceptId: 'ipc.validation', difficulty: 'hard', format: 'multiple_choice' },
      { questionId: 'q2', correctOption: 1, explanation: 'Review', conceptId: 'electron.process-model', difficulty: 'medium', format: 'multiple_choice' }
    ])
    expect(recordAssessment).toHaveBeenCalledWith(expect.objectContaining({
      source: 'prerequisite_quiz', assessmentId: 'session-1', attempt: 2,
      answers: [expect.objectContaining({ conceptId: 'ipc.validation', score: 1 }), expect.objectContaining({ conceptId: 'electron.process-model', score: 0 })]
    }))
  })
})
