import { randomUUID } from 'node:crypto'
import type { GamificationState, KnowledgeMastery, LearningGoal, MasteryProfile, MisconceptionRecord, PersonalizationState, ReviewState } from '../../shared/contracts'
import { createEmptyMasteryProfile } from './model'
import { MASTERY_SCHEMA_VERSION, migrateMasteryState } from './migrations'
import { createDefaultPersonalization } from './personalization'
import { createEmptyGamification } from './gamification'

export type MasteryState = {
  schemaVersion: number
  deviceId: string
  updatedAt: string
  profile: MasteryProfile
  reviews: Record<string, ReviewState>
  misconceptions: Record<string, MisconceptionRecord>
  personalization: PersonalizationState
  goals: Record<string, LearningGoal>
  gamification: GamificationState
  sync: MasteryAccountSync
}

export type MasteryAccountSync = {
  accountUserId: string | null
  revision: number
  remoteUpdatedAt: string | null
  lastSyncedAt: string | null
  pending: boolean
  lastError?: string
}

type KeyValueStorage = { get: (key: string) => unknown; set: (key: string, value: unknown) => void }

export function createEmptyMasteryState(deviceId: string = randomUUID()): MasteryState {
  return {
    schemaVersion: MASTERY_SCHEMA_VERSION, deviceId, updatedAt: new Date().toISOString(), profile: createEmptyMasteryProfile(), reviews: {}, misconceptions: {}, goals: {},
    personalization: createDefaultPersonalization(), gamification: createEmptyGamification(),
    sync: { accountUserId: null, revision: 0, remoteUpdatedAt: null, lastSyncedAt: null, pending: false }
  }
}

export class MasteryRepository {
  private readonly key = 'state'
  private state: MasteryState

  constructor(private readonly storage: KeyValueStorage, legacy: KnowledgeMastery[] = [], now = new Date().toISOString()) {
    this.state = migrateMasteryState(storage.get(this.key), legacy, now, randomUUID())
    this.persist()
  }

  read(): MasteryState { return structuredClone(this.state) }

  update(mutator: (state: MasteryState) => MasteryState, options: { markDirty?: boolean } = {}): MasteryState {
    const next = mutator(this.read())
    next.updatedAt = new Date().toISOString()
    if (options.markDirty !== false) next.sync = { ...next.sync, pending: true, lastError: undefined }
    this.state = migrateMasteryState(next, [], new Date().toISOString(), this.state.deviceId)
    this.persist()
    return this.read()
  }

  replaceSyncedState(next: MasteryState): MasteryState {
    this.state = migrateMasteryState(next, [], new Date().toISOString(), this.state.deviceId)
    this.persist()
    return this.read()
  }

  private persist(): void { this.storage.set(this.key, this.state) }
}
