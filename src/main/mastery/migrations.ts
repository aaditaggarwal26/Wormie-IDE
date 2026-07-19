import type { KnowledgeMastery, LearningAward, MasteryEvidence, MasteryProfile } from '../../shared/contracts'
import { resolveConcept, registerCustomConcept } from './catalog'
import { applyEvidence, createEmptyMasteryProfile } from './model'
import type { MasteryState } from './repository'
import { createDefaultPersonalization } from './personalization'
import { createEmptyGamification } from './gamification'

export const MASTERY_SCHEMA_VERSION = 2
const sources = new Set(['prerequisite_quiz', 'change_understanding', 'review', 'challenge', 'assignment', 'classroom_assessment', 'teacher_assessment', 'test_out', 'legacy_import'])
const formats = new Set(['multiple_choice', 'multiple_select', 'true_false', 'predict_behavior', 'spot_the_bug', 'short_answer', 'code_ordering', 'challenge', 'teacher_review', 'legacy_summary'])

function normalizedEvidence(value: unknown): MasteryEvidence | null {
  if (!value || typeof value !== 'object') return null
  const item = value as Partial<MasteryEvidence>
  if (!item.id || !item.dedupeKey || !item.conceptId || !item.assessmentId || !item.questionId || !item.independenceGroup || !sources.has(String(item.source)) || !formats.has(String(item.format))) return null
  if (!['easy', 'medium', 'hard'].includes(String(item.difficulty)) || typeof item.score !== 'number' || !Number.isFinite(item.score) || !item.occurredAt || !Number.isFinite(Date.parse(item.occurredAt))) return null
  return {
    id: String(item.id).slice(0, 200), dedupeKey: String(item.dedupeKey).slice(0, 300), conceptId: String(item.conceptId).slice(0, 100),
    source: item.source!, assessmentId: String(item.assessmentId).slice(0, 200), questionId: String(item.questionId).slice(0, 200),
    independenceGroup: String(item.independenceGroup).slice(0, 300), attempt: Math.max(1, Math.min(100, Math.round(Number(item.attempt) || 1))),
    score: Math.max(0, Math.min(1, item.score)), difficulty: item.difficulty!, format: item.format!, occurredAt: new Date(item.occurredAt).toISOString(),
    ...(item.sessionId ? { sessionId: String(item.sessionId).slice(0, 200) } : {}),
    ...(item.criticalMisconception ? { criticalMisconception: true } : {}),
    ...(item.misconceptionSummary ? { misconceptionSummary: String(item.misconceptionSummary).slice(0, 300) } : {}),
    ...(item.correctiveExplanation ? { correctiveExplanation: String(item.correctiveExplanation).slice(0, 800) } : {}),
    ...(item.assignmentId ? { assignmentId: String(item.assignmentId).slice(0, 200) } : {}),
    ...(item.classroomId ? { classroomId: String(item.classroomId).slice(0, 200) } : {})
  }
}

function restoreProfile(value: unknown, now: string): MasteryProfile {
  let profile = createEmptyMasteryProfile()
  if (!value || typeof value !== 'object') return profile
  const rawEvidence = (value as { evidence?: unknown }).evidence
  if (!rawEvidence || typeof rawEvidence !== 'object') return profile
  for (const candidate of Object.values(rawEvidence)) {
    const evidence = normalizedEvidence(candidate)
    if (evidence) profile = applyEvidence(profile, evidence, now)
  }
  return profile
}

export function migrateMasteryState(raw: unknown, legacy: KnowledgeMastery[] = [], now = new Date().toISOString(), deviceId = 'device-local'): MasteryState {
  const candidate = raw && typeof raw === 'object' ? raw as { deviceId?: unknown; updatedAt?: unknown; profile?: unknown; reviews?: unknown; misconceptions?: unknown; personalization?: unknown; goals?: unknown; gamification?: unknown; sync?: unknown } : {}
  const rawSync = candidate.sync && typeof candidate.sync === 'object' ? candidate.sync as { accountUserId?: unknown; revision?: unknown; remoteUpdatedAt?: unknown; lastSyncedAt?: unknown; pending?: unknown; lastError?: unknown } : {}
  const isoOrNull = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null
  let profile = restoreProfile(candidate.profile, now)
  for (const item of legacy) {
    if (!item || typeof item !== 'object') continue
    const concept = resolveConcept(String(item.conceptId ?? '')) ?? resolveConcept(String(item.name ?? '')) ?? registerCustomConcept(String(item.name ?? item.conceptId ?? 'Legacy concept'))
    const quizIds = Array.isArray(item.evidenceQuizIds) && item.evidenceQuizIds.length ? item.evidenceQuizIds.slice(0, 20) : [`summary-${concept.id}`]
    for (const quizId of quizIds) {
      const occurredAt = Number.isFinite(Date.parse(item.updatedAt)) ? new Date(item.updatedAt).toISOString() : now
      profile = applyEvidence(profile, {
        id: `legacy:${concept.id}:${String(quizId).slice(0, 120)}`,
        dedupeKey: `legacy:${concept.id}:${String(quizId).slice(0, 120)}`,
        conceptId: concept.id, source: 'legacy_import', assessmentId: String(quizId).slice(0, 200),
        questionId: 'legacy-summary', independenceGroup: `legacy:${concept.id}`, attempt: 1,
        score: Math.max(0, Math.min(1, Number(item.mastery) / 100 || 0)), difficulty: 'medium', format: 'legacy_summary', occurredAt
      }, now)
    }
  }
  const objectOrEmpty = <T>(value: unknown): Record<string, T> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, T> : {}
  const personalization = candidate.personalization && typeof candidate.personalization === 'object'
    ? { ...createDefaultPersonalization(), ...(candidate.personalization as object), explicit: { ...createDefaultPersonalization().explicit, ...((candidate.personalization as { explicit?: object }).explicit ?? {}) }, inferred: { ...createDefaultPersonalization().inferred, ...((candidate.personalization as { inferred?: object }).inferred ?? {}) } }
    : createDefaultPersonalization()
  const gamification = candidate.gamification && typeof candidate.gamification === 'object'
    ? { ...createEmptyGamification(), ...(candidate.gamification as object), awards: objectOrEmpty<LearningAward>((candidate.gamification as { awards?: unknown }).awards), processedEventIds: objectOrEmpty<true>((candidate.gamification as { processedEventIds?: unknown }).processedEventIds) }
    : createEmptyGamification()
  return {
    schemaVersion: MASTERY_SCHEMA_VERSION,
    deviceId: typeof candidate.deviceId === 'string' && candidate.deviceId.length <= 200 ? candidate.deviceId : deviceId,
    updatedAt: isoOrNull(candidate.updatedAt) ?? now,
    profile,
    reviews: objectOrEmpty(candidate.reviews),
    misconceptions: objectOrEmpty(candidate.misconceptions),
    personalization,
    goals: objectOrEmpty(candidate.goals),
    gamification,
    sync: {
      accountUserId: typeof rawSync.accountUserId === 'string' && rawSync.accountUserId.length <= 200 ? rawSync.accountUserId : null,
      revision: Math.max(0, Math.min(1_000_000_000, Math.round(Number(rawSync.revision) || 0))),
      remoteUpdatedAt: isoOrNull(rawSync.remoteUpdatedAt),
      lastSyncedAt: isoOrNull(rawSync.lastSyncedAt),
      pending: Boolean(rawSync.pending),
      ...(typeof rawSync.lastError === 'string' && rawSync.lastError ? { lastError: rawSync.lastError.slice(0, 500) } : {})
    }
  }
}
