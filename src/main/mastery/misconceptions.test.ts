import { describe, expect, it } from 'vitest'
import type { MasteryEvidence } from '../../shared/contracts'
import { applyMisconceptionEvidence, completeRemediation } from './misconceptions'

const evidence = (overrides: Partial<MasteryEvidence> = {}): MasteryEvidence => ({
  id: 'e1', dedupeKey: 'e1', conceptId: 'javascript.functions-closures', source: 'review', assessmentId: 'a1',
  questionId: 'q1', independenceGroup: 'a1:q1', attempt: 1, score: 0, difficulty: 'hard', format: 'short_answer',
  occurredAt: '2026-07-19T12:00:00.000Z', misconceptionSummary: 'Closures copy values.', correctiveExplanation: 'Closures retain lexical bindings.', ...overrides
})

describe('misconceptions', () => {
  it('tracks recurrence, remediation, and later independent resolution', () => {
    const first = applyMisconceptionEvidence({}, evidence())
    const id = Object.keys(first)[0]
    const recurring = applyMisconceptionEvidence(first, evidence({ id: 'e2', dedupeKey: 'e2', assessmentId: 'a2', independenceGroup: 'a2:q2', occurredAt: '2026-07-20T12:00:00.000Z' }))
    expect(recurring[id].recurrenceCount).toBe(2)
    const remediated = completeRemediation(recurring, id, '2026-07-20T13:00:00.000Z')
    expect(remediated[id].status).toBe('remediated')
    const resolved = applyMisconceptionEvidence(remediated, evidence({ id: 'e3', dedupeKey: 'e3', assessmentId: 'a3', independenceGroup: 'a3:q3', score: 1, misconceptionSummary: undefined, occurredAt: '2026-07-21T12:00:00.000Z' }))
    expect(resolved[id].status).toBe('resolved')
    expect(resolved[id].resolvingEvidenceId).toBe('e3')
  })
})
