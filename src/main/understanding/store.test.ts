import { describe, expect, it } from 'vitest'
import { defaultUnderstandingSettings } from './significance'
import { createEmptyUnderstandingState, migrateUnderstandingState, UnderstandingRepository } from './store'

class MemoryStorage {
  value: unknown
  get(): unknown { return this.value }
  set(_key: string, value: unknown): void { this.value = value }
}

describe('UnderstandingRepository', () => {
  it('migrates missing and legacy state to current defaults', () => {
    expect(migrateUnderstandingState(undefined)).toEqual(createEmptyUnderstandingState())
    const migrated = migrateUnderstandingState({ schemaVersion: 0, history: [] })
    expect(migrated.schemaVersion).toBe(1)
    expect(migrated.settings).toEqual(defaultUnderstandingSettings)
  })

  it('persists and restores state through the existing key-value abstraction', () => {
    const storage = new MemoryStorage()
    const first = new UnderstandingRepository(storage)
    first.update((state) => ({ ...state, settings: { ...state.settings, passingScore: 90 } }))
    const restored = new UnderstandingRepository(storage)
    expect(restored.read().settings.passingScore).toBe(90)
  })

  it('normalizes unsafe persisted setting ranges', () => {
    const storage = new MemoryStorage()
    storage.value = { ...createEmptyUnderstandingState(), settings: { ...defaultUnderstandingSettings, passingScore: 1000, minimumQuestions: 9, maximumQuestions: 2 } }
    const state = new UnderstandingRepository(storage).read()
    expect(state.settings.passingScore).toBe(100)
    expect(state.settings.minimumQuestions).toBeLessThanOrEqual(state.settings.maximumQuestions)
  })
})
