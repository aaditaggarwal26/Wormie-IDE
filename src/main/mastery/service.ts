import { createHash, randomUUID } from 'node:crypto'
import type {
  ConceptDetailView, ConceptMastery, ConceptMasterySummary, DomainMasteryView, ExplicitLearningPreferences,
  LearningGoal, LearningGoalInput, MasteryConceptView, MasteryEvidence, MasteryEvidenceFormat, MasteryEvidencePage,
  MasteryEvidenceSource, MasteryOverviewView, MasteryStatus, MisconceptionRecord, PersonalizationState,
  ReviewQueueItem, ReviewResult, ReviewSession, ReviewSubmission
} from '../../shared/contracts'
import { STANDARD_DOMAINS, canonicalConcepts, resolveConcept, resolveOrRegisterConcept } from './catalog'
import type { KnowledgeGraph } from './graph'
import { applyEvidence } from './model'
import type { MasteryRepository } from './repository'
import { applyMisconceptionEvidence } from './misconceptions'
import { inferPreference, personalizationPrompt } from './personalization'
import { scheduleReview } from './reviews'
import { applyRewardEvent } from './gamification'
import { progressGoals } from './goals'
import { createGoal } from './goals'
import { forgottenTopicRisk } from './reviews'

type ReviewDraft = { title: string; questions: Array<{ prompt: string; options: string[]; correctOption: number; difficulty: 'easy' | 'medium' | 'hard'; explanation: string }> }
type InternalReview = { publicSession: ReviewSession; answerKey: Array<{ questionId: string; correctOption: number; explanation: string; difficulty: 'easy' | 'medium' | 'hard' }>; createdAt: number }

export type AssessmentAnswerEvidence = {
  questionId: string
  conceptId: string
  score: number
  difficulty: 'easy' | 'medium' | 'hard'
  format: MasteryEvidenceFormat
  criticalMisconception?: boolean
  misconceptionSummary?: string
  correctiveExplanation?: string
}

export type AssessmentEvidenceInput = {
  source: MasteryEvidenceSource
  assessmentId: string
  sessionId?: string
  attempt: number
  bypassed?: boolean
  assignmentId?: string
  classroomId?: string
  answers: AssessmentAnswerEvidence[]
}

export class MasteryService {
  private reviewGenerator: ((prompt: string) => Promise<ReviewDraft>) | null = null
  private readonly reviewSessions = new Map<string, InternalReview>()
  constructor(
    readonly repository: MasteryRepository,
    private readonly graph: KnowledgeGraph,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {}

  setReviewGenerator(generator: (prompt: string) => Promise<ReviewDraft>): void { this.reviewGenerator = generator }

  recordAssessment(input: AssessmentEvidenceInput): { acceptedEvidenceIds: string[]; conceptIds: string[] } {
    if (input.bypassed) return { acceptedEvidenceIds: [], conceptIds: [] }
    const now = this.clock()
    const current = this.repository.read()
    const pending: MasteryEvidence[] = []
    for (const answer of input.answers.slice(0, 100)) {
      const concept = resolveOrRegisterConcept(answer.conceptId)
      const seed = `${input.source}:${input.assessmentId}:${answer.questionId}:${input.attempt}`
      const evidenceId = createHash('sha256').update(seed).digest('hex')
      const dedupeKey = seed.slice(0, 300)
      if (current.profile.evidence[evidenceId] || current.profile.dedupeKeys[dedupeKey] || pending.some((item) => item.id === evidenceId || item.dedupeKey === dedupeKey)) continue
      pending.push({
        id: evidenceId, dedupeKey, conceptId: concept.id, source: input.source,
        assessmentId: input.assessmentId.slice(0, 200), ...(input.sessionId ? { sessionId: input.sessionId.slice(0, 200) } : {}),
        questionId: answer.questionId.slice(0, 200), independenceGroup: `${input.source}:${input.assessmentId}:${answer.questionId}`.slice(0, 300),
        attempt: input.attempt, score: answer.score, difficulty: answer.difficulty, format: answer.format, occurredAt: now,
        ...(answer.criticalMisconception ? { criticalMisconception: true } : {}),
        ...(answer.misconceptionSummary ? { misconceptionSummary: answer.misconceptionSummary } : {}),
        ...(answer.correctiveExplanation ? { correctiveExplanation: answer.correctiveExplanation } : {}),
        ...(input.assignmentId ? { assignmentId: input.assignmentId.slice(0, 200) } : {}),
        ...(input.classroomId ? { classroomId: input.classroomId.slice(0, 200) } : {})
      })
    }
    if (pending.length) {
      this.repository.update((state) => {
        let profile = state.profile
        let misconceptions = state.misconceptions
        let personalization = state.personalization
        let gamification = state.gamification
        for (const evidence of pending) {
          profile = applyEvidence(profile, evidence, now)
          const before = misconceptions
          misconceptions = applyMisconceptionEvidence(misconceptions, evidence)
          personalization = inferPreference(personalization, { conceptId: evidence.conceptId, format: evidence.format, score: evidence.score, misconception: evidence.misconceptionSummary }, now)
          gamification = applyRewardEvent(gamification, { id: `reward:${evidence.id}`, evidenceId: evidence.id, type: 'evidence', occurredAt: evidence.occurredAt, score: evidence.score, difficulty: evidence.difficulty, format: evidence.format, attempt: evidence.attempt, conceptId: evidence.conceptId })
          for (const [id, item] of Object.entries(misconceptions)) {
            if (item.status === 'resolved' && before[id]?.status !== 'resolved') gamification = applyRewardEvent(gamification, { id: `resolved:${id}:${evidence.id}`, evidenceId: evidence.id, type: 'misconception_resolved', occurredAt: evidence.occurredAt, conceptId: evidence.conceptId })
          }
        }
        const reviews = { ...state.reviews }
        const byConcept = new Map<string, MasteryEvidence[]>()
        for (const evidence of pending) byConcept.set(evidence.conceptId, [...(byConcept.get(evidence.conceptId) ?? []), evidence])
        for (const [conceptId, evidence] of byConcept) {
          const score = evidence.reduce((sum, item) => sum + item.score, 0) / evidence.length
          reviews[conceptId] = { ...scheduleReview(reviews[conceptId] ?? null, { score, confidence: profile.concepts[conceptId]?.confidence ?? 0, occurredAt: now }), conceptId }
          if (input.source === 'review') gamification = applyRewardEvent(gamification, { id: `review:${input.assessmentId}:${conceptId}`, type: 'review_completed', occurredAt: now, conceptId })
        }
        let goals = state.goals
        const xpDelta = gamification.totalXp - state.gamification.totalXp
        if (xpDelta > 0) goals = progressGoals(goals, { type: 'xp', amount: xpDelta }, now)
        if (input.source === 'review') goals = progressGoals(goals, { type: 'review', amount: 1 }, now)
        return { ...state, profile, misconceptions, personalization, gamification, reviews, goals }
      })
    }
    return { acceptedEvidenceIds: pending.map((item) => item.id), conceptIds: [...new Set(pending.map((item) => item.conceptId))].sort() }
  }

  learningPlan(terms: string[]): { conceptIds: string[]; blockingConceptIds: string[]; diagnosticConceptIds: string[] } {
    const conceptIds = [...new Set(terms.slice(0, 20).map((term) => resolveOrRegisterConcept(term).id))].sort()
    const profile = this.repository.read().profile
    const summaries = new Map(Object.entries(profile.concepts))
    const blocking = new Set<string>()
    const diagnostic = new Set<string>()
    for (const conceptId of conceptIds) {
      if (!this.graph.get(conceptId)) continue
      const result = this.graph.blockingPrerequisites(conceptId, summaries)
      result.blocking.forEach((id) => blocking.add(id))
      result.diagnostic.forEach((id) => diagnostic.add(id))
    }
    return { conceptIds, blockingConceptIds: [...blocking].sort(), diagnosticConceptIds: [...diagnostic].sort() }
  }

  promptContext(): { catalog: Array<{ id: string; name: string; prerequisiteIds: string[] }>; profile: ConceptMasterySummary[]; personalization: ReturnType<typeof personalizationPrompt> } {
    const state = this.repository.read()
    const profile = state.profile
    return {
      catalog: canonicalConcepts.filter((concept) => concept.active).map(({ id, name, prerequisiteIds }) => ({ id, name, prerequisiteIds })),
      profile: Object.values(profile.concepts).map(({ conceptId, mastery, confidence, status }) => ({ conceptId, mastery, confidence, status })).sort((left, right) => left.conceptId.localeCompare(right.conceptId)).slice(0, 100),
      personalization: personalizationPrompt(state.personalization)
    }
  }

  getOverview(): MasteryOverviewView {
    const state = this.repository.read()
    const views = canonicalConcepts.map((concept) => this.conceptView(concept.id, state.profile.concepts[concept.id], state.reviews[concept.id]))
    const assessed = views.filter((view) => view.confidence > 0)
    const confidenceTotal = assessed.reduce((sum, view) => sum + view.confidence, 0)
    const overallMastery = confidenceTotal > 0 ? Math.round(assessed.reduce((sum, view) => sum + view.mastery * view.confidence, 0) / confidenceTotal) : null
    const statusCounts = Object.fromEntries(['unassessed', 'learning', 'weak', 'developing', 'proficient', 'strong', 'review_due'].map((status) => [status, views.filter((view) => view.status === status).length])) as Record<MasteryStatus, number>
    const changes = views.flatMap((view) => {
      const history = state.profile.concepts[view.conceptId]?.scoreHistory ?? []
      if (history.length < 2) return []
      const previous = history.at(-2)!
      const latest = history.at(-1)!
      return [{ conceptId: view.conceptId, name: view.name, delta: latest.mastery - previous.mastery, at: latest.at }]
    }).sort((left, right) => right.at.localeCompare(left.at))
    const allPoints = Object.values(state.profile.concepts).flatMap((concept) => concept.scoreHistory).sort((left, right) => left.at.localeCompare(right.at))
    const windowDays = allPoints.length >= 2 ? Math.max(1, (Date.parse(allPoints.at(-1)!.at) - Date.parse(allPoints[0].at)) / 86_400_000) : 0
    const estimatedGrowth = allPoints.length >= 2
      ? { pointsPer30Days: Math.round((((allPoints.at(-1)!.mastery - allPoints[0].mastery) / windowDays) * 30) * 10) / 10, evidenceWindowDays: Math.round(windowDays) }
      : null
    return {
      overallMastery, overallConfidence: assessed.length ? Math.round((confidenceTotal / assessed.length) * 100) / 100 : 0,
      assessedConcepts: assessed.length, unassessedConcepts: views.length - assessed.length,
      reviewDueConcepts: views.filter((view) => view.status === 'review_due').length, statusCounts,
      strongConcepts: views.filter((view) => view.status === 'strong').sort((a, b) => b.mastery - a.mastery).slice(0, 8),
      weakConcepts: views.filter((view) => ['weak', 'learning'].includes(view.status)).sort((a, b) => a.mastery - b.mastery).slice(0, 8),
      reviewDue: views.filter((view) => view.status === 'review_due').sort((a, b) => String(a.nextReviewAt).localeCompare(String(b.nextReviewAt))).slice(0, 8),
      recentImprovements: changes.filter((item) => item.delta > 0).slice(0, 8), recentRegressions: changes.filter((item) => item.delta < 0).slice(0, 8),
      estimatedGrowth,
      gamification: { totalXp: state.gamification.totalXp, level: state.gamification.level, dailyStreak: state.gamification.dailyStreak, weeklyStreak: state.gamification.weeklyStreak }
    }
  }

  getDomainSummaries(): DomainMasteryView[] {
    const state = this.repository.read()
    return STANDARD_DOMAINS.map((domain) => {
      const definitions = canonicalConcepts.filter((concept) => concept.domain === domain)
      const views = definitions.map((concept) => this.conceptView(concept.id, state.profile.concepts[concept.id], state.reviews[concept.id]))
      const assessed = views.filter((view) => view.confidence > 0)
      const confidence = assessed.reduce((sum, view) => sum + view.confidence, 0)
      return {
        domain, mastery: confidence ? Math.round(assessed.reduce((sum, view) => sum + view.mastery * view.confidence, 0) / confidence) : null,
        confidence: assessed.length ? Math.round((confidence / assessed.length) * 100) / 100 : 0,
        assessedConcepts: assessed.length, totalConcepts: views.length,
        weakConcepts: views.filter((view) => ['weak', 'learning'].includes(view.status)).length,
        strongConcepts: views.filter((view) => view.status === 'strong').length,
        reviewDueConcepts: views.filter((view) => view.status === 'review_due').length
      }
    })
  }

  getConceptDetail(conceptId: string): ConceptDetailView {
    const definition = resolveConcept(conceptId)
    if (!definition) throw new Error('Concept not found.')
    const state = this.repository.read()
    const mastery = state.profile.concepts[conceptId]
    const plan = this.learningPlan([conceptId])
    const viewFor = (id: string) => this.conceptView(id, state.profile.concepts[id], state.reviews[id])
    const review = state.reviews[conceptId] ?? null
    const status = this.conceptView(conceptId, mastery, review).status
    const recommendedAction: ConceptDetailView['recommendedAction'] = plan.blockingConceptIds.length ? 'learn-prerequisites' : plan.diagnosticConceptIds.length ? 'take-diagnostic' : status === 'review_due' ? 'start-review' : !mastery || mastery.mastery < 70 ? 'keep-practicing' : 'continue'
    return {
      concept: viewFor(conceptId), reasons: mastery?.reasons ?? ['No assessment evidence has been recorded yet.'],
      prerequisites: this.graph.prerequisites(conceptId).map(viewFor), dependents: this.graph.dependents(conceptId).map(viewFor),
      blockingPrerequisiteIds: plan.blockingConceptIds, diagnosticPrerequisiteIds: plan.diagnosticConceptIds,
      evidence: this.getEvidencePage({ conceptId, page: 1, pageSize: 50 }).items,
      scoreHistory: mastery?.scoreHistory ?? [], misconceptions: Object.values(state.misconceptions).filter((item) => item.conceptId === conceptId).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt)),
      review, recommendedAction
    }
  }

  getEvidencePage(input: { conceptId?: string; page: number; pageSize: number }): MasteryEvidencePage {
    const state = this.repository.read()
    const filtered = Object.values(state.profile.evidence).filter((item) => !input.conceptId || item.conceptId === input.conceptId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt) || b.id.localeCompare(a.id))
    const start = (input.page - 1) * input.pageSize
    return { page: input.page, pageSize: input.pageSize, total: filtered.length, items: filtered.slice(start, start + input.pageSize).map((item) => ({
      id: item.id, conceptId: item.conceptId, source: item.source, score: item.score, difficulty: item.difficulty,
      format: item.format, occurredAt: item.occurredAt, assessmentId: item.assessmentId, attempt: item.attempt,
      ...(item.assignmentId ? { assignmentId: item.assignmentId } : {}), ...(item.classroomId ? { classroomId: item.classroomId } : {})
    })) }
  }

  getMisconceptions(status?: MisconceptionRecord['status']): MisconceptionRecord[] {
    return Object.values(this.repository.read().misconceptions).filter((item) => !status || item.status === status).sort((a, b) => b.lastSeenAt.localeCompare(a.lastSeenAt))
  }

  getReviews(): ReviewQueueItem[] {
    const state = this.repository.read()
    const now = this.clock()
    return Object.values(state.reviews).map((review) => {
      const risk = forgottenTopicRisk(review, now)
      return { concept: this.conceptView(review.conceptId, state.profile.concepts[review.conceptId], review), review, overdueDays: risk.overdueDays, forgottenRisk: risk.risk }
    }).sort((a, b) => a.review.nextReviewAt.localeCompare(b.review.nextReviewAt))
  }

  async startReview(conceptId: string): Promise<ReviewSession> {
    const concept = resolveConcept(conceptId)
    if (!concept) throw new Error('Concept not found.')
    if (!this.reviewGenerator) throw new Error('Configure an AI provider before starting a fresh review.')
    for (const [id, session] of this.reviewSessions) if (Date.now() - session.createdAt > 30 * 60_000) this.reviewSessions.delete(id)
    const detail = this.getConceptDetail(conceptId)
    const draft = await this.reviewGenerator(`Create 3-5 fresh applied review questions for ${concept.name} (${concept.id}). Do not reuse prior answer text. Use the learner context only to tune difficulty.\n${JSON.stringify({ description: concept.description, mastery: detail.concept.mastery, confidence: detail.concept.confidence, misconceptions: detail.misconceptions.map((item) => item.summary), preferences: this.promptContext().personalization })}`)
    const id = randomUUID()
    const createdAt = this.clock()
    const questions = draft.questions.slice(0, 5).map((question, index) => ({ id: `${id}:${index}`, prompt: question.prompt.slice(0, 900), options: question.options.slice(0, 5).map((option) => option.slice(0, 400)), difficulty: question.difficulty }))
    if (!questions.length || draft.questions.some((question) => question.correctOption < 0 || question.correctOption >= question.options.length)) throw new Error('The generated review was invalid.')
    const publicSession = { id, conceptId, title: draft.title.slice(0, 160), questions, createdAt }
    this.reviewSessions.set(id, { publicSession, answerKey: draft.questions.slice(0, 5).map((question, index) => ({ questionId: questions[index].id, correctOption: question.correctOption, explanation: question.explanation.slice(0, 900), difficulty: question.difficulty })), createdAt: Date.now() })
    return publicSession
  }

  submitReview(submission: ReviewSubmission): ReviewResult {
    const session = this.reviewSessions.get(submission.sessionId)
    if (!session) throw new Error('This review session expired. Start a fresh review.')
    this.reviewSessions.delete(submission.sessionId)
    const feedback = session.answerKey.map((answer) => ({ questionId: answer.questionId, correct: submission.answers[answer.questionId] === answer.correctOption, explanation: answer.explanation }))
    const score = Math.round((feedback.filter((item) => item.correct).length / feedback.length) * 100)
    this.recordAssessment({ source: 'review', assessmentId: session.publicSession.id, sessionId: session.publicSession.id, attempt: 1, answers: session.answerKey.map((answer) => ({ questionId: answer.questionId, conceptId: session.publicSession.conceptId, score: feedback.find((item) => item.questionId === answer.questionId)?.correct ? 1 : 0, difficulty: answer.difficulty, format: 'multiple_choice' })) })
    return { sessionId: submission.sessionId, score, passed: score >= 80, feedback }
  }

  getPersonalization(): PersonalizationState { return this.repository.read().personalization }
  savePersonalization(update: Partial<ExplicitLearningPreferences>): PersonalizationState { return this.repository.update((state) => ({ ...state, personalization: { ...state.personalization, explicit: { ...state.personalization.explicit, ...update } } })).personalization }
  resetPersonalization(): PersonalizationState { return this.repository.update((state) => ({ ...state, personalization: { ...state.personalization, inferred: { preferredFormats: [], weakConceptIds: [], strongConceptIds: [], recurringMisconceptions: [], observations: 0, updatedAt: null } } })).personalization }
  getGoals(): LearningGoal[] { return Object.values(this.repository.read().goals).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)) }
  createGoal(input: LearningGoalInput): LearningGoal { const goal = createGoal(input, this.clock()); this.repository.update((state) => ({ ...state, goals: { ...state.goals, [goal.id]: goal } })); return goal }
  updateGoal(id: string, update: Partial<Pick<LearningGoal, 'title' | 'target' | 'status'>>): LearningGoal { const state = this.repository.read(); const goal = state.goals[id]; if (!goal) throw new Error('Learning goal not found.'); const next = { ...goal, ...update, title: update.title?.trim() || goal.title, target: update.target ? Math.max(1, Math.min(1_000_000, Math.round(update.target))) : goal.target, updatedAt: this.clock() }; this.repository.update((value) => ({ ...value, goals: { ...value.goals, [id]: next } })); return next }
  deleteGoal(id: string): void { this.repository.update((state) => { const goals = { ...state.goals }; delete goals[id]; return { ...state, goals } }) }
  getGamification() { return this.repository.read().gamification }
  getSyncStatus() { return { state: 'local-only' as const, pending: 0, lastSyncedAt: null } }

  private conceptView(conceptId: string, mastery?: ConceptMastery, review?: import('../../shared/contracts').ReviewState): MasteryConceptView {
    const definition = resolveConcept(conceptId)
    if (!definition) throw new Error('Concept not found.')
    const due = review && Date.parse(review.nextReviewAt) <= Date.parse(this.clock())
    return {
      conceptId, name: definition.name, description: definition.description, domain: definition.domain, depth: definition.depth,
      mastery: mastery?.mastery ?? 0, confidence: mastery?.confidence ?? 0,
      status: due && mastery ? 'review_due' : mastery?.status ?? 'unassessed',
      lastAssessedAt: mastery?.lastAssessedAt ?? null, nextReviewAt: review?.nextReviewAt ?? null
    }
  }
}
