import { randomUUID } from 'node:crypto'
import type { KnowledgeMastery, MasteryProfile } from '../../shared/contracts'
import { createEmptyMasteryProfile } from './model'
import { MASTERY_SCHEMA_VERSION, migrateMasteryState } from './migrations'

export type MasteryState = {
  schemaVersion: number
  deviceId: string
  profile: MasteryProfile
}

type KeyValueStorage = { get: (key: string) => unknown; set: (key: string, value: unknown) => void }

export function createEmptyMasteryState(deviceId: string = randomUUID()): MasteryState {
  return { schemaVersion: MASTERY_SCHEMA_VERSION, deviceId, profile: createEmptyMasteryProfile() }
}

export class MasteryRepository {
  private readonly key = 'state'
  private state: MasteryState

  constructor(private readonly storage: KeyValueStorage, legacy: KnowledgeMastery[] = [], now = new Date().toISOString()) {
    this.state = migrateMasteryState(storage.get(this.key), legacy, now, randomUUID())
    this.persist()
  }

  read(): MasteryState { return structuredClone(this.state) }

  update(mutator: (state: MasteryState) => MasteryState): MasteryState {
    const next = mutator(this.read())
    this.state = migrateMasteryState(next, [], new Date().toISOString(), this.state.deviceId)
    this.persist()
    return this.read()
  }

  private persist(): void { this.storage.set(this.key, this.state) }
}
