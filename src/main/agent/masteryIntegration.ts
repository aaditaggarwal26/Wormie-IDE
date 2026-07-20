import type { QuizResult } from '../../shared/contracts'
import type { MasteryService } from '../mastery/service'
import type { AnswerKey } from './grading'

type EvidenceRecorder = Pick<MasteryService, 'recordAssessment'>

export function recordPrerequisiteQuizEvidence(
  mastery: EvidenceRecorder,
  sessionId: string,
  attempt: number,
  result: QuizResult,
  answerKey: AnswerKey
): void {
  mastery.recordAssessment({
    source: 'prerequisite_quiz',
    assessmentId: sessionId,
    sessionId,
    attempt,
    answers: result.feedback.map((feedback) => {
      const key = answerKey.find((candidate) => candidate.questionId === feedback.questionId)
      return {
        questionId: feedback.questionId,
        conceptId: key?.conceptId ?? 'javascript.runtime.execution',
        score: feedback.correct ? 1 : 0,
        difficulty: key?.difficulty ?? 'medium',
        format: key?.format ?? 'multiple_choice'
      }
    })
  })
}
