import { z } from 'zod'
import type { MasterySyncStatus } from '../../shared/contracts'
import { resolveConcept } from './catalog'
import { migrateMasteryState } from './migrations'
import type { MasteryRepository, MasteryState } from './repository'

type SupabaseLike = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => { maybeSingle: () => Promise<{ data: unknown; error: unknown }> }
    }
    upsert: (value: unknown, options?: unknown) => Promise<{ error: unknown }>
  }
}

const remoteRowSchema = z.object({
  payload: z.unknown(),
  revision: z.number().int().min(0).optional(),
  updated_at: z.string().optional()
}).passthrough()

function newer(left: string | undefined, right: string | undefined): boolean {
  return Date.parse(left ?? '') >= Date.parse(right ?? '')
}

export function mergeMasteryStates(local: MasteryState, remote: MasteryState | null, accountUserId: string, now = new Date().toISOString()): MasteryState {
  if (!remote) {
    return { ...local, sync: { ...local.sync, accountUserId, lastError: undefined } }
  }
  const profile = {
    ...local.profile,
    evidence: { ...remote.profile.evidence, ...local.profile.evidence },
    dedupeKeys: { ...remote.profile.dedupeKeys, ...local.profile.dedupeKeys }
  }
  const reviews = { ...remote.reviews }
  for (const [conceptId, review] of Object.entries(local.reviews)) {
    const existing = reviews[conceptId]
    reviews[conceptId] = !existing || newer(review.lastReviewedAt, existing.lastReviewedAt) ? review : existing
  }
  const goals = { ...remote.goals }
  for (const [goalId, goal] of Object.entries(local.goals)) {
    const existing = goals[goalId]
    goals[goalId] = !existing || newer(goal.updatedAt, existing.updatedAt) ? goal : existing
  }
  const gamification = {
    ...remote.gamification,
    ...local.gamification,
    totalXp: Math.max(local.gamification.totalXp, remote.gamification.totalXp),
    level: Math.max(local.gamification.level, remote.gamification.level),
    dailyStreak: Math.max(local.gamification.dailyStreak, remote.gamification.dailyStreak),
    weeklyStreak: Math.max(local.gamification.weeklyStreak, remote.gamification.weeklyStreak),
    activeDates: [...new Set([...remote.gamification.activeDates, ...local.gamification.activeDates])].sort(),
    awards: { ...remote.gamification.awards, ...local.gamification.awards },
    processedEventIds: { ...remote.gamification.processedEventIds, ...local.gamification.processedEventIds }
  }
  return migrateMasteryState({
    ...local,
    updatedAt: newer(local.updatedAt, remote.updatedAt) ? local.updatedAt : remote.updatedAt,
    profile,
    reviews,
    misconceptions: { ...remote.misconceptions, ...local.misconceptions },
    personalization: local.sync.pending ? local.personalization : remote.personalization,
    goals,
    gamification,
    sync: {
      accountUserId,
      revision: Math.max(local.sync.revision, remote.sync.revision),
      remoteUpdatedAt: remote.updatedAt,
      lastSyncedAt: now,
      pending: local.sync.pending
    }
  }, [], now, local.deviceId)
}

export class MasterySyncCoordinator {
  private syncing = false

  constructor(private readonly repository: MasteryRepository, private readonly client: SupabaseLike) {}

  getStatus(): MasterySyncStatus {
    const sync = this.repository.read().sync
    if (this.syncing) return { state: 'syncing', pending: sync.pending ? 1 : 0, lastSyncedAt: sync.lastSyncedAt }
    if (!sync.accountUserId) return { state: sync.pending ? 'offline' : 'local-only', pending: sync.pending ? 1 : 0, lastSyncedAt: sync.lastSyncedAt, ...(sync.lastError ? { error: sync.lastError } : {}) }
    if (sync.lastError) return { state: 'error', pending: sync.pending ? 1 : 0, lastSyncedAt: sync.lastSyncedAt, error: sync.lastError }
    return { state: sync.pending ? 'offline' : 'synced', pending: sync.pending ? 1 : 0, lastSyncedAt: sync.lastSyncedAt }
  }

  async syncUser(user: { id: string }): Promise<void> {
    if (this.syncing) return
    this.syncing = true
    const now = new Date().toISOString()
    try {
      const remoteResult = await this.client.from('mastery_profiles').select('payload,revision,updated_at').eq('user_id', user.id).maybeSingle()
      if (remoteResult.error && typeof remoteResult.error === 'object' && 'code' in remoteResult.error && remoteResult.error.code !== 'PGRST116') throw remoteResult.error
      const remoteRow = remoteResult.data ? remoteRowSchema.parse(remoteResult.data) : null
      const local = this.repository.read()
      const remote = remoteRow ? migrateMasteryState(remoteRow.payload, [], remoteRow.updated_at ?? now, local.deviceId) : null
      const merged = mergeMasteryStates(local, remote, user.id, now)
      const nextRevision = Math.max(merged.sync.revision, remoteRow?.revision ?? 0) + 1
      const synced = {
        ...merged,
        sync: { accountUserId: user.id, revision: nextRevision, remoteUpdatedAt: now, lastSyncedAt: now, pending: false }
      }
      const upload = await this.client.from('mastery_profiles').upsert({
        user_id: user.id,
        device_id: synced.deviceId,
        revision: nextRevision,
        payload: synced,
        summary: classroomSummaryPayload(synced),
        updated_at: now
      }, { onConflict: 'user_id' })
      if (upload.error) throw upload.error
      this.repository.replaceSyncedState(synced)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not sync mastery profile.'
      this.repository.update((state) => ({ ...state, sync: { ...state.sync, accountUserId: user.id, pending: true, lastError: message } }), { markDirty: false })
    } finally {
      this.syncing = false
    }
  }
}

export function classroomSummaryPayload(state: MasteryState) {
  const concepts = Object.values(state.profile.concepts)
  const weakConcepts = concepts
    .filter((concept) => concept.status === 'weak' || concept.status === 'learning')
    .sort((left, right) => left.mastery - right.mastery)
    .slice(0, 5)
    .map((concept) => ({ conceptId: concept.conceptId, name: resolveConcept(concept.conceptId)?.name ?? concept.conceptId, mastery: Math.round(concept.mastery) }))
  const strongConcepts = concepts
    .filter((concept) => concept.status === 'strong' || concept.status === 'proficient')
    .sort((left, right) => right.mastery - left.mastery)
    .slice(0, 5)
    .map((concept) => ({ conceptId: concept.conceptId, name: resolveConcept(concept.conceptId)?.name ?? concept.conceptId, mastery: Math.round(concept.mastery) }))
  const assessed = concepts.filter((concept) => concept.status !== 'unassessed')
  const confidence = assessed.reduce((sum, concept) => sum + concept.confidence, 0)
  const mastery = assessed.reduce((sum, concept) => sum + (concept.mastery * concept.confidence), 0)
  return {
    assessedConcepts: assessed.length,
    overallMastery: confidence > 0 ? Math.round(mastery / confidence) : null,
    reviewDueConcepts: concepts.filter((concept) => concept.status === 'review_due').length,
    weakConcepts,
    strongConcepts
  }
}
