import { createHash } from 'node:crypto'
import type { ConceptMasterySummary, MasteryEvidence, MasteryEvidenceFormat, MasteryEvidenceSource } from '../../shared/contracts'
import { canonicalConcepts, resolveOrRegisterConcept } from './catalog'
import type { KnowledgeGraph } from './graph'
import { applyEvidence } from './model'
import type { MasteryRepository } from './repository'

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
  constructor(
    readonly repository: MasteryRepository,
    private readonly graph: KnowledgeGraph,
    private readonly clock: () => string = () => new Date().toISOString()
  ) {}

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
      this.repository.update((state) => ({
        ...state,
        profile: pending.reduce((profile, evidence) => applyEvidence(profile, evidence, now), state.profile)
      }))
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

  promptContext(): { catalog: Array<{ id: string; name: string; prerequisiteIds: string[] }>; profile: ConceptMasterySummary[] } {
    const profile = this.repository.read().profile
    return {
      catalog: canonicalConcepts.filter((concept) => concept.active).map(({ id, name, prerequisiteIds }) => ({ id, name, prerequisiteIds })),
      profile: Object.values(profile.concepts).map(({ conceptId, mastery, confidence, status }) => ({ conceptId, mastery, confidence, status })).sort((left, right) => left.conceptId.localeCompare(right.conceptId)).slice(0, 100)
    }
  }
}
