import { describe, expect, it } from 'vitest'
import { canonicalConcepts } from './catalog'
import { KnowledgeGraph } from './graph'
import { MasteryRepository } from './repository'
import { MasteryService } from './service'

class MemoryStorage { value: unknown; get(): unknown { return this.value }; set(_key: string, value: unknown): void { this.value = value } }
const NOW = '2026-07-19T12:00:00.000Z'

describe('mastery profile projections', () => {
  it('does not fabricate an average or growth estimate for an empty profile', () => {
    const service = new MasteryService(new MasteryRepository(new MemoryStorage(), [], NOW), new KnowledgeGraph(canonicalConcepts), () => NOW)
    const overview = service.getOverview()
    expect(overview.overallMastery).toBeNull()
    expect(overview.assessedConcepts).toBe(0)
    expect(overview.unassessedConcepts).toBe(canonicalConcepts.length)
    expect(overview.estimatedGrowth).toBeNull()
  })

  it('returns confidence-aware domain and concept details with sanitized paginated evidence', () => {
    const service = new MasteryService(new MasteryRepository(new MemoryStorage(), [], NOW), new KnowledgeGraph(canonicalConcepts), () => NOW)
    service.recordAssessment({ source: 'review', assessmentId: 'r1', attempt: 1, answers: [{ questionId: 'q1', conceptId: 'ipc.validation', score: 1, difficulty: 'hard', format: 'short_answer' }] })
    expect(service.getOverview().overallMastery).not.toBeNull()
    expect(service.getDomainSummaries().find((domain) => domain.domain === 'ipc')?.assessedConcepts).toBe(1)
    expect(service.getConceptDetail('ipc.validation').prerequisites.length).toBeGreaterThan(0)
    const page = service.getEvidencePage({ conceptId: 'ipc.validation', page: 1, pageSize: 10 })
    expect(page.total).toBe(1)
    expect(JSON.stringify(page)).not.toMatch(/dedupeKey|questionId|sessionId|correctAnswer|rubric|prompt|path/i)
  })

  it('generates fresh private review questions and records completion', async () => {
    const service = new MasteryService(new MasteryRepository(new MemoryStorage(), [], NOW), new KnowledgeGraph(canonicalConcepts), () => NOW)
    service.setReviewGenerator(async () => ({ title: 'IPC validation review', questions: [{ prompt: 'Where is IPC input trusted?', options: ['Renderer', 'Nowhere without validation', 'CSS'], correctOption: 1, difficulty: 'hard', explanation: 'Validate in main.' }] }))
    const session = await service.startReview('ipc.validation')
    expect(JSON.stringify(session)).not.toMatch(/correctOption|explanation/)
    const result = service.submitReview({ sessionId: session.id, answers: { [session.questions[0].id]: 1 } })
    expect(result.passed).toBe(true)
    expect(service.repository.read().profile.concepts['ipc.validation'].correctEvidence).toBe(1)
    expect(() => service.submitReview({ sessionId: session.id, answers: {} })).toThrow(/expired/i)
  })
})
