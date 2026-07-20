import { describe, expect, it } from 'vitest'
import { KnowledgeGraph } from './graph'
import { canonicalConcepts } from './catalog'
import { MasteryRepository } from './repository'
import { MasteryService } from './service'

class MemoryStorage {
  value: unknown
  get(): unknown { return this.value }
  set(_key: string, value: unknown): void { this.value = value }
}

const NOW = '2026-07-19T12:00:00.000Z'

describe('MasteryService', () => {
  it('records canonical question evidence idempotently across attempts', () => {
    const repository = new MasteryRepository(new MemoryStorage(), [], NOW)
    const service = new MasteryService(repository, new KnowledgeGraph(canonicalConcepts), () => NOW)
    const input = {
      source: 'prerequisite_quiz' as const, assessmentId: 's1', attempt: 1,
      answers: [{ questionId: 'q1', conceptId: 'IPC security', score: 1, difficulty: 'hard' as const, format: 'multiple_choice' as const }]
    }
    expect(service.recordAssessment(input).acceptedEvidenceIds).toHaveLength(1)
    expect(service.recordAssessment(input).acceptedEvidenceIds).toHaveLength(0)
    service.recordAssessment({ ...input, attempt: 2, answers: [{ ...input.answers[0], score: 0 }] })
    expect(Object.keys(repository.read().profile.evidence)).toHaveLength(2)
    expect(repository.read().profile.concepts['ipc.validation'].correctEvidence).toBe(1)
    expect(repository.read().reviews['ipc.validation'].nextReviewAt).toBeTruthy()
    expect(repository.read().gamification.totalXp).toBeGreaterThan(0)
    expect(repository.read().personalization.inferred.observations).toBe(2)
  })

  it('identifies weak blockers and diagnostic prerequisites without blocking on missing history', () => {
    const repository = new MasteryRepository(new MemoryStorage(), [], NOW)
    const service = new MasteryService(repository, new KnowledgeGraph(canonicalConcepts), () => NOW)
    service.recordAssessment({
      source: 'test_out', assessmentId: 'known-js', attempt: 1,
      answers: [{ questionId: 'q1', conceptId: 'javascript.runtime.execution', score: 1, difficulty: 'hard', format: 'short_answer' }]
    })
    service.recordAssessment({
      source: 'test_out', assessmentId: 'weak-electron', attempt: 1,
      answers: [
        { questionId: 'q1', conceptId: 'electron.process-model', score: 0, difficulty: 'hard', format: 'short_answer' },
        { questionId: 'q2', conceptId: 'electron.process-model', score: 0, difficulty: 'hard', format: 'spot_the_bug' }
      ]
    })
    const plan = service.learningPlan(['context isolation'])
    expect(plan.conceptIds).toContain('electron.security.context-isolation')
    expect(plan.blockingConceptIds).toContain('electron.process-model')
    expect(plan.diagnosticConceptIds).toContain('security.input-validation')
  })

  it('records no evidence for bypassed assessments', () => {
    const repository = new MasteryRepository(new MemoryStorage(), [], NOW)
    const service = new MasteryService(repository, new KnowledgeGraph(canonicalConcepts), () => NOW)
    expect(service.recordAssessment({ source: 'change_understanding', assessmentId: 'bypass', attempt: 1, bypassed: true, answers: [] }).acceptedEvidenceIds).toEqual([])
    expect(repository.read().profile.evidence).toEqual({})
  })
})
