import { describe, expect, it } from 'vitest'
import type { MasteryEvidence } from '../../shared/contracts'
import { applyEvidence, createEmptyMasteryProfile, projectConcept } from './model'

const NOW = '2026-07-19T12:00:00.000Z'
const LATER = '2027-01-19T12:00:00.000Z'

function evidence(overrides: Partial<MasteryEvidence> = {}): MasteryEvidence {
  return {
    id: 'e1', dedupeKey: 'quiz:s1:q1:1', conceptId: 'javascript.functions-closures', source: 'prerequisite_quiz',
    assessmentId: 's1', questionId: 'q1', independenceGroup: 's1:q1', attempt: 1, score: 1,
    difficulty: 'medium', format: 'multiple_choice', occurredAt: NOW, ...overrides
  }
}

describe('mastery evidence model', () => {
  it('represents unseen concepts as unassessed with zero confidence', () => {
    expect(projectConcept(createEmptyMasteryProfile(), 'javascript.functions-closures', NOW)).toMatchObject({
      mastery: 0, confidence: 0, status: 'unassessed', correctEvidence: 0, incorrectEvidence: 0
    })
  })

  it('updates deterministically for correct, incorrect, and partial evidence', () => {
    const correct = projectConcept(applyEvidence(createEmptyMasteryProfile(), evidence(), NOW), evidence().conceptId, NOW)
    const incorrect = projectConcept(applyEvidence(createEmptyMasteryProfile(), evidence({ score: 0 }), NOW), evidence().conceptId, NOW)
    const partial = projectConcept(applyEvidence(createEmptyMasteryProfile(), evidence({ score: 0.5 }), NOW), evidence().conceptId, NOW)
    expect(correct.mastery).toBeGreaterThan(partial.mastery)
    expect(partial.mastery).toBeGreaterThan(incorrect.mastery)
    expect(correct.correctEvidence).toBe(1)
    expect(incorrect.incorrectEvidence).toBe(1)
  })

  it('weights difficulty and format reliability including guessing risk', () => {
    const easyGuess = projectConcept(applyEvidence(createEmptyMasteryProfile(), evidence({ difficulty: 'easy', format: 'true_false' }), NOW), evidence().conceptId, NOW)
    const hardApplied = projectConcept(applyEvidence(createEmptyMasteryProfile(), evidence({ difficulty: 'hard', format: 'short_answer' }), NOW), evidence().conceptId, NOW)
    expect(hardApplied.mastery).toBeGreaterThan(easyGuess.mastery)
    expect(hardApplied.confidence).toBeGreaterThan(easyGuess.confidence)
  })

  it('deduplicates evidence IDs and keys and bounds repeated attempts to one influence group', () => {
    const once = applyEvidence(createEmptyMasteryProfile(), evidence(), NOW)
    expect(applyEvidence(once, evidence(), NOW)).toEqual(once)
    expect(applyEvidence(once, evidence({ id: 'other-id' }), NOW)).toEqual(once)
    const retried = applyEvidence(once, evidence({ id: 'e2', dedupeKey: 'quiz:s1:q1:2', attempt: 2, score: 0 }), NOW)
    expect(projectConcept(retried, evidence().conceptId, NOW).correctEvidence).toBe(1)
  })

  it('raises confidence with independent diverse evidence and decays confidence over time', () => {
    const once = applyEvidence(createEmptyMasteryProfile(), evidence(), NOW)
    const diverse = applyEvidence(once, evidence({ id: 'e2', dedupeKey: 'review:r1:q2:1', assessmentId: 'r1', questionId: 'q2', independenceGroup: 'r1:q2', source: 'review', format: 'short_answer' }), NOW)
    expect(projectConcept(diverse, evidence().conceptId, NOW).confidence).toBeGreaterThan(projectConcept(once, evidence().conceptId, NOW).confidence)
    expect(projectConcept(diverse, evidence().conceptId, LATER).confidence).toBeLessThan(projectConcept(diverse, evidence().conceptId, NOW).confidence)
  })

  it('caps proficiency for unresolved critical misconceptions and explains the score', () => {
    const profile = applyEvidence(createEmptyMasteryProfile(), evidence({ criticalMisconception: true, misconceptionSummary: 'Closures copy values.' }), NOW)
    const projection = projectConcept(profile, evidence().conceptId, NOW)
    expect(projection.mastery).toBeLessThan(60)
    expect(projection.reasons.join(' ')).toMatch(/critical misconception/i)
  })
})
