import type {
  ChangeInput,
  ChangeSignificanceResult,
  ChangeSource,
  PrivateQuizQuestion,
  UnderstandingAnswer,
  UnderstandingGateStatus,
  UnderstandingQuestionFeedback,
  UnderstandingQuiz,
  UnderstandingSubmission
} from '../../shared/contracts'
import { gradeDeterministicAnswers } from './grading'
import type { UnderstandingRepository, UnderstandingState } from './store'

type SemanticGrader = (
  question: PrivateQuizQuestion,
  answer: UnderstandingAnswer
) => Promise<{ correct: boolean; explanation: string; misconception?: string }>
type RemediationGenerator = (quiz: UnderstandingQuiz, feedback: UnderstandingQuestionFeedback[]) => Promise<string>

function publicStatus(gate: UnderstandingState['gates'][string]): UnderstandingGateStatus {
  return {
    changeId: gate.quiz.changeId,
    source: gate.quiz.source,
    fingerprint: gate.quiz.fingerprint,
    state: gate.state,
    quiz: gate.quiz,
    draftAnswers: gate.draftAnswers,
    lastResult: gate.lastResult,
    unlocked: gate.state === 'passed' || gate.state === 'bypassed'
  }
}

export class UnderstandingGateService {
  constructor(
    private readonly repository: UnderstandingRepository,
    private readonly semanticGrader?: SemanticGrader,
    private readonly remediationGenerator?: RemediationGenerator
  ) {}

  getSettings() { return this.repository.read().settings }
  setSettings(settings: ReturnType<UnderstandingGateService['getSettings']>) { return this.repository.setSettings(settings) }
  getHistory() {
    const state = this.repository.read()
    return { history: state.history, mastery: Object.values(state.mastery).sort((left, right) => left.name.localeCompare(right.name)) }
  }

  createGate(change: ChangeInput, quiz: UnderstandingQuiz, privateQuestions: PrivateQuizQuestion[]): UnderstandingGateStatus {
    if (quiz.changeId !== change.id || quiz.source !== change.source) throw new Error('Quiz does not match this change.')
    if (quiz.questions.length !== privateQuestions.length) throw new Error('Quiz grading data is incomplete.')
    const existing = this.getStatus(change.id, quiz.fingerprint)
    if (existing?.quiz?.id === quiz.id) return existing
    const now = new Date().toISOString()
    const next = this.repository.update((state) => ({
      ...state,
      gates: {
        ...state.gates,
        [quiz.id]: { quiz, privateQuestions, draftAnswers: {}, state: 'required', lastResult: null, attempt: 0, startedAt: now, updatedAt: now }
      },
      auditEvents: [...state.auditEvents, {
        type: 'quiz_triggered' as const, at: now, source: quiz.source,
        significance: quiz.significance.level, reasonCount: quiz.significance.triggerReasons.length
      }]
    }))
    return publicStatus(next.gates[quiz.id])
  }

  getStatus(changeId: string, fingerprint?: string): UnderstandingGateStatus | null {
    const gates = Object.values(this.repository.read().gates)
      .filter((gate) => gate.quiz.changeId === changeId && (!fingerprint || gate.quiz.fingerprint === fingerprint))
      .sort((left, right) => right.quiz.createdAt.localeCompare(left.quiz.createdAt))
    return gates[0] ? publicStatus(gates[0]) : null
  }

  getStatusByQuiz(quizId: string): UnderstandingGateStatus | null {
    const gate = this.repository.read().gates[quizId]
    return gate ? publicStatus(gate) : null
  }

  saveAnswers(quizId: string, answers: Record<string, UnderstandingAnswer>): UnderstandingGateStatus {
    const current = this.repository.read().gates[quizId]
    if (!current) throw new Error('Understanding quiz not found.')
    if (current.state === 'passed' || current.state === 'bypassed') return publicStatus(current)
    const allowed = new Set(current.privateQuestions.map((question) => question.id))
    const sanitized = Object.fromEntries(Object.entries(answers).filter(([id]) => allowed.has(id)).map(([id, answer]) => [id, {
      value: Array.isArray(answer.value) ? answer.value.map(String).slice(0, 12) : typeof answer.value === 'string' ? answer.value.slice(0, 4_000) : Boolean(answer.value),
      savedAt: new Date().toISOString()
    }]))
    const state = this.repository.update((value) => ({
      ...value,
      gates: { ...value.gates, [quizId]: { ...value.gates[quizId], draftAnswers: sanitized, state: 'in_progress', updatedAt: new Date().toISOString() } }
    }))
    return publicStatus(state.gates[quizId])
  }

  async submit(submission: UnderstandingSubmission) {
    const state = this.repository.read()
    const gate = state.gates[submission.quizId]
    if (!gate) throw new Error('Understanding quiz not found.')
    if (gate.state === 'passed' || gate.state === 'bypassed') return gate.lastResult ?? {
      quizId: gate.quiz.id, score: 100, passed: true, attempt: gate.attempt, feedback: [], weakConceptIds: []
    }
    const answers = this.saveAnswers(submission.quizId, submission.answers).draftAnswers
    const deterministic = gradeDeterministicAnswers(gate.privateQuestions, answers)
    const feedback = [...deterministic.feedback]
    let earnedWeight = deterministic.earnedWeight
    for (const questionId of deterministic.pendingQuestionIds) {
      const question = gate.privateQuestions.find((candidate) => candidate.id === questionId)!
      const answer = answers[questionId]
      const semantic = answer && this.semanticGrader
        ? await this.semanticGrader(question, answer)
        : { correct: false, explanation: question.explanation, misconception: 'A written explanation is required.' }
      if (semantic.correct) earnedWeight += question.weight
      feedback.push({ questionId, ...semantic })
    }
    const score = deterministic.totalWeight === 0 ? 0 : Math.round((earnedWeight / deterministic.totalWeight) * 100)
    const criticalQuestionsPassed = gate.quiz.significance.level !== 'critical' || gate.privateQuestions
      .filter((question) => question.difficulty === 'hard')
      .every((question) => feedback.some((item) => item.questionId === question.id && item.correct))
    const passed = score >= gate.quiz.passingScore && criticalQuestionsPassed
    const attempt = gate.attempt + 1
    const weakConceptIds = [...new Set(feedback.filter((item) => !item.correct).map((item) => gate.privateQuestions.find((question) => question.id === item.questionId)?.conceptId).filter((id): id is string => Boolean(id)))]
    const shouldRemediate = !passed && (!state.settings.allowRetryBeforeRemediation || attempt >= 2)
    const weakNames = gate.quiz.concepts.filter((concept) => weakConceptIds.includes(concept.id)).map((concept) => concept.name)
    const fallbackRemediation = `Review ${weakNames.join(', ') || 'the change flow'} before trying fresh questions.`
    const remediation = shouldRemediate && this.remediationGenerator
      ? await this.remediationGenerator(gate.quiz, feedback).catch(() => fallbackRemediation)
      : shouldRemediate ? fallbackRemediation : undefined
    const result = {
      quizId: gate.quiz.id,
      score,
      passed,
      attempt,
      feedback,
      weakConceptIds,
      remediation
    }
    const now = new Date().toISOString()
    this.repository.update((value) => {
      const mastery = { ...value.mastery }
      for (const question of gate.privateQuestions) {
        const concept = gate.quiz.concepts.find((candidate) => candidate.id === question.conceptId)
        if (!concept) continue
        const existing = mastery[concept.id] ?? { conceptId: concept.id, name: concept.name, mastery: 50, attempts: 0, correct: 0, updatedAt: now, evidenceQuizIds: [] }
        const correct = feedback.some((item) => item.questionId === question.id && item.correct)
        const attempts = existing.attempts + 1
        const correctCount = existing.correct + (correct ? 1 : 0)
        const evidenceWeight = question.difficulty === 'hard' ? 0.16 : question.difficulty === 'medium' ? 0.12 : 0.08
        const nextMastery = Math.round(existing.mastery + ((correct ? 100 : 0) - existing.mastery) * evidenceWeight)
        mastery[concept.id] = { ...existing, attempts, correct: correctCount, mastery: nextMastery, updatedAt: now, evidenceQuizIds: [...new Set([...(existing.evidenceQuizIds ?? []), gate.quiz.id])].slice(-20) }
      }
      const history = passed || shouldRemediate ? [{
        id: `${gate.quiz.id}:${attempt}`,
        changeId: gate.quiz.changeId,
        source: gate.quiz.source,
        title: gate.quiz.title,
        significance: gate.quiz.significance.level,
        score,
        outcome: passed ? 'passed' as const : 'failed' as const,
        concepts: gate.quiz.concepts.map((concept) => concept.name),
        completedAt: now,
        durationSeconds: Math.max(0, Math.round((Date.now() - Date.parse(gate.startedAt)) / 1000))
      }, ...value.history].slice(0, 500) : value.history
      return {
        ...value,
        gates: { ...value.gates, [gate.quiz.id]: { ...value.gates[gate.quiz.id], draftAnswers: answers, lastResult: result, attempt, state: passed ? 'passed' : shouldRemediate ? 'remediation' : 'in_progress', updatedAt: now } },
        history,
        mastery,
        auditEvents: [...value.auditEvents, { type: passed ? 'quiz_passed' as const : 'quiz_failed' as const, at: now, source: gate.quiz.source, significance: gate.quiz.significance.level }]
      }
    })
    return result
  }

  bypass(quizId: string, rawReason: string): UnderstandingGateStatus {
    const state = this.repository.read()
    const gate = state.gates[quizId]
    if (!gate) throw new Error('Understanding quiz not found.')
    if (!state.settings.developerBypass) throw new Error('Developer bypass is disabled.')
    if (state.settings.strictMode && gate.quiz.significance.level === 'critical') throw new Error('Strict mode does not allow critical-change bypasses.')
    const reason = typeof rawReason === 'string' ? rawReason.trim() : ''
    if (state.settings.bypassRequiresReason && (reason.length < 8 || reason.length > 500)) throw new Error('Enter a bypass reason between 8 and 500 characters.')
    const now = new Date().toISOString()
    const next = this.repository.update((value) => ({
      ...value,
      gates: { ...value.gates, [quizId]: { ...value.gates[quizId], state: 'bypassed', updatedAt: now } },
      history: [{ id: `${quizId}:bypass`, changeId: gate.quiz.changeId, source: gate.quiz.source, title: gate.quiz.title, significance: gate.quiz.significance.level, score: null, outcome: 'bypassed' as const, concepts: gate.quiz.concepts.map((concept) => concept.name), completedAt: now, bypassReason: reason || undefined }, ...value.history].slice(0, 500),
      auditEvents: [...value.auditEvents, { type: 'gate_bypassed' as const, at: now, source: gate.quiz.source, significance: gate.quiz.significance.level }]
    }))
    return publicStatus(next.gates[quizId])
  }

  recordRejected(change: ChangeInput, significance: ChangeSignificanceResult): void {
    const now = new Date().toISOString()
    this.repository.update((state) => ({
      ...state,
      history: [{
        id: `${change.id}:rejected:${now}`,
        changeId: change.id,
        source: change.source,
        title: change.title.slice(0, 160),
        significance: significance.level,
        score: null,
        outcome: 'rejected' as const,
        concepts: significance.detectedConcepts,
        completedAt: now
      }, ...state.history].slice(0, 500),
      auditEvents: [...state.auditEvents, {
        type: 'change_rejected' as const,
        at: now,
        source: change.source,
        significance: significance.level,
        reasonCount: significance.triggerReasons.length
      }]
    }))
  }

  assertUnlocked(changeId: string, source: ChangeSource, fingerprint: string): void {
    const matchingChange = Object.values(this.repository.read().gates).filter((gate) => gate.quiz.changeId === changeId && gate.quiz.source === source)
    const exact = matchingChange.find((gate) => gate.quiz.fingerprint === fingerprint)
    if (!exact && matchingChange.length > 0) throw new Error('This change changed after the understanding check. Complete a fresh quiz.')
    if (!exact || !['passed', 'bypassed'].includes(exact.state)) throw new Error('Pass the understanding check before continuing.')
  }
}
