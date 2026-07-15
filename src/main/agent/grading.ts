import type { QuizResult, QuizSubmission } from '../../shared/contracts'

export type AnswerKey = Array<{
  questionId: string
  correctOption: number
  explanation: string
}>

export function gradeQuiz(submission: QuizSubmission, answerKey: AnswerKey, passingScore: number): QuizResult {
  if (answerKey.length === 0) throw new Error('This learning session has no quiz.')
  const feedback = answerKey.map((answer) => ({
    questionId: answer.questionId,
    correct: submission.answers[answer.questionId] === answer.correctOption,
    explanation: answer.explanation
  }))
  const correctAnswers = feedback.filter((answer) => answer.correct).length
  const score = Math.round((correctAnswers / answerKey.length) * 100)
  return { score, passed: score >= passingScore, feedback }
}
