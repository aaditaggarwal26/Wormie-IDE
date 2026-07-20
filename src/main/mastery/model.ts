import type {
  ConceptMastery,
  MasteryEvidence,
  MasteryEvidenceFormat,
  MasteryEvidenceSource,
  MasteryProfile,
  MasteryStatus
} from '../../shared/contracts'
import { CATALOG_VERSION } from './catalog'

const DAY_MS = 86_400_000
const difficultyWeight = { easy: 0.8, medium: 1, hard: 1.25 } as const
const formatWeight: Record<MasteryEvidenceFormat, number> = {
  multiple_choice: 0.7,
  multiple_select: 0.9,
  true_false: 0.55,
  predict_behavior: 1.1,
  spot_the_bug: 1.1,
  short_answer: 1.2,
  code_ordering: 1.1,
  challenge: 1.25,
  teacher_review: 1.3,
  legacy_summary: 0.2
}

export function createEmptyMasteryProfile(): MasteryProfile {
  return { evidence: {}, concepts: {}, dedupeKeys: {} }
}

function round(value: number, digits = 2): number {
  const factor = 10 ** digits
  return Math.round(value * factor) / factor
}

function validTime(value: string, fallback: string): string {
  return Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : fallback
}

function boundedEvidence(input: MasteryEvidence, now: string): MasteryEvidence {
  return {
    ...input,
    id: input.id.slice(0, 200),
    dedupeKey: input.dedupeKey.slice(0, 300),
    conceptId: input.conceptId.slice(0, 100),
    assessmentId: input.assessmentId.slice(0, 200),
    questionId: input.questionId.slice(0, 200),
    independenceGroup: input.independenceGroup.slice(0, 300),
    attempt: Math.max(1, Math.min(100, Math.round(input.attempt))),
    score: Math.max(0, Math.min(1, input.score)),
    occurredAt: validTime(input.occurredAt, now),
    ...(input.misconceptionSummary ? { misconceptionSummary: input.misconceptionSummary.slice(0, 300) } : {}),
    ...(input.correctiveExplanation ? { correctiveExplanation: input.correctiveExplanation.slice(0, 800) } : {})
  }
}

function effectiveEvidence(profile: MasteryProfile, conceptId: string): MasteryEvidence[] {
  const groups = new Map<string, MasteryEvidence>()
  for (const item of Object.values(profile.evidence).filter((candidate) => candidate.conceptId === conceptId)) {
    const current = groups.get(item.independenceGroup)
    if (!current || item.score > current.score || (item.score === current.score && item.occurredAt > current.occurredAt)) groups.set(item.independenceGroup, item)
  }
  return [...groups.values()].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt) || left.id.localeCompare(right.id))
}

function statusFor(mastery: number, confidence: number): MasteryStatus {
  if (confidence === 0) return 'unassessed'
  if (confidence < 0.2) return 'learning'
  if (mastery < 45) return 'weak'
  if (mastery < 70) return 'developing'
  if (mastery < 85) return 'proficient'
  return 'strong'
}

export function projectConcept(profile: MasteryProfile, conceptId: string, now: string): ConceptMastery {
  const items = effectiveEvidence(profile, conceptId)
  const previousHistory = profile.concepts[conceptId]?.scoreHistory ?? []
  if (items.length === 0) {
    return {
      conceptId, mastery: 0, confidence: 0, status: 'unassessed', correctEvidence: 0, incorrectEvidence: 0,
      firstAssessedAt: null, lastAssessedAt: null, lastCorrectAt: null, lastIncorrectAt: null,
      consecutiveSuccesses: 0, consecutiveFailures: 0, difficultyDistribution: { easy: 0, medium: 0, hard: 0 },
      evidenceSources: [], evidenceIds: [], scoreHistory: previousHistory, canonicalVersion: CATALOG_VERSION,
      reasons: ['No assessment evidence has been recorded yet.']
    }
  }

  let totalWeight = 0
  let weightedScore = 0
  const difficultyDistribution = { easy: 0, medium: 0, hard: 0 }
  const formats = new Set<MasteryEvidenceFormat>()
  const sources = new Set<MasteryEvidenceSource>()
  const assessments = new Set<string>()
  for (const item of items) {
    const weight = difficultyWeight[item.difficulty] * formatWeight[item.format]
    totalWeight += weight
    weightedScore += item.score * weight
    difficultyDistribution[item.difficulty] += 1
    formats.add(item.format)
    sources.add(item.source)
    assessments.add(item.assessmentId)
  }

  let mastery = Math.round(((weightedScore + 0.6) / (totalWeight + 1.2)) * 100)
  const critical = items.some((item) => item.criticalMisconception)
  if (critical) mastery = Math.min(mastery, 59)
  const lastAt = items.at(-1)!.occurredAt
  const ageDays = Math.max(0, (Date.parse(now) - Date.parse(lastAt)) / DAY_MS)
  const recency = Math.max(0.35, Math.exp(-(ageDays / 365) * 0.7))
  const quantity = 1 - Math.exp(-totalWeight / 2.75)
  const diversity = Math.min(1, 0.7 + Math.min(2, formats.size - 1) * 0.08 + Math.min(2, sources.size - 1) * 0.08 + Math.min(2, assessments.size - 1) * 0.06)
  const confidence = round(Math.min(1, quantity * diversity * recency))
  const correctItems = items.filter((item) => item.score >= 0.7)
  const incorrectItems = items.filter((item) => item.score <= 0.3)
  let consecutiveSuccesses = 0
  let consecutiveFailures = 0
  for (const item of [...items].reverse()) {
    if (item.score >= 0.7 && consecutiveFailures === 0) consecutiveSuccesses += 1
    else if (item.score <= 0.3 && consecutiveSuccesses === 0) consecutiveFailures += 1
    else break
  }
  const reasons = [
    `${items.length} independent evidence ${items.length === 1 ? 'item' : 'items'} across ${formats.size} question ${formats.size === 1 ? 'format' : 'formats'}.`,
    `The latest evidence is ${Math.round(ageDays)} days old; confidence reflects recency and source diversity.`
  ]
  if (critical) reasons.push('An unresolved critical misconception caps this concept below proficiency.')
  if (confidence < 0.35) reasons.push('More independent evidence is needed before this score is considered reliable.')
  return {
    conceptId, mastery, confidence, status: statusFor(mastery, confidence),
    correctEvidence: correctItems.length, incorrectEvidence: incorrectItems.length,
    firstAssessedAt: items[0].occurredAt, lastAssessedAt: lastAt,
    lastCorrectAt: correctItems.at(-1)?.occurredAt ?? null,
    lastIncorrectAt: incorrectItems.at(-1)?.occurredAt ?? null,
    consecutiveSuccesses, consecutiveFailures, difficultyDistribution,
    evidenceSources: [...sources].sort(), evidenceIds: items.map((item) => item.id),
    scoreHistory: previousHistory, canonicalVersion: CATALOG_VERSION, reasons
  }
}

export function applyEvidence(profile: MasteryProfile, rawEvidence: MasteryEvidence, now: string): MasteryProfile {
  const evidence = boundedEvidence(rawEvidence, now)
  if (!evidence.id || !evidence.dedupeKey || !evidence.conceptId || profile.evidence[evidence.id] || profile.dedupeKeys[evidence.dedupeKey]) return profile
  const next: MasteryProfile = {
    evidence: { ...profile.evidence, [evidence.id]: evidence },
    dedupeKeys: { ...profile.dedupeKeys, [evidence.dedupeKey]: evidence.id },
    concepts: { ...profile.concepts }
  }
  const projection = projectConcept(next, evidence.conceptId, now)
  const previous = profile.concepts[evidence.conceptId]
  const history = [...(previous?.scoreHistory ?? [])]
  if (!previous || previous.mastery !== projection.mastery || previous.confidence !== projection.confidence) {
    history.push({ at: validTime(now, evidence.occurredAt), mastery: projection.mastery, confidence: projection.confidence, evidenceId: evidence.id })
  }
  next.concepts[evidence.conceptId] = { ...projection, scoreHistory: history.slice(-500) }
  return next
}
