import type {
  PrivateQuizQuestion,
  PublicQuizQuestion,
  UnderstandingAnswer,
  UnderstandingQuestionFeedback
} from '../../shared/contracts'

export function toPublicQuestion(question: PrivateQuizQuestion): PublicQuizQuestion {
  const { correctAnswer: _correct, explanation: _explanation, gradingRubric: _rubric, weight: _weight, ...publicQuestion } = question
  return publicQuestion
}

export type DeterministicGradingResult = {
  score: number
  earnedWeight: number
  totalWeight: number
  feedback: UnderstandingQuestionFeedback[]
  pendingQuestionIds: string[]
}

function equalAnswer(actual: UnderstandingAnswer | undefined, expected: unknown): boolean {
  if (!actual) return false
  if (Array.isArray(expected)) {
    return Array.isArray(actual.value) && [...actual.value].sort().join('\0') === [...expected].map(String).sort().join('\0')
  }
  if (typeof expected === 'boolean') return actual.value === expected
  return actual.value === String(expected)
}

export function gradeDeterministicAnswers(
  questions: PrivateQuizQuestion[],
  answers: Record<string, UnderstandingAnswer>
): DeterministicGradingResult {
  const pendingQuestionIds: string[] = []
  let earnedWeight = 0
  const totalWeight = questions.reduce((total, question) => total + question.weight, 0)
  const feedback: UnderstandingQuestionFeedback[] = []

  for (const question of questions) {
    if (question.type === 'short_answer' || question.type === 'predict_behavior' || question.type === 'spot_the_bug') {
      pendingQuestionIds.push(question.id)
      continue
    }
    const correct = equalAnswer(answers[question.id], question.correctAnswer)
    if (correct) earnedWeight += question.weight
    feedback.push({ questionId: question.id, correct, explanation: question.explanation })
  }

  return {
    score: totalWeight === 0 ? 0 : Math.round((earnedWeight / totalWeight) * 100),
    earnedWeight,
    totalWeight,
    feedback,
    pendingQuestionIds
  }
}
