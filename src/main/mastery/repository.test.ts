import { describe, expect, it } from 'vitest'
import { createEmptyMasteryState, MasteryRepository } from './repository'

class MemoryStorage {
  value: unknown
  get(): unknown { return this.value }
  set(_key: string, value: unknown): void { this.value = value }
}

describe('MasteryRepository', () => {
  it('persists immutable updates and restores them after restart', () => {
    const storage = new MemoryStorage()
    const first = new MasteryRepository(storage)
    first.update((state) => ({ ...state, deviceId: 'device-test' }))
    expect(new MasteryRepository(storage).read().deviceId).toBe('device-test')
  })

  it('returns clones and initializes a versioned device-wide profile', () => {
    const repository = new MasteryRepository(new MemoryStorage())
    const read = repository.read()
    read.deviceId = 'mutated'
    expect(repository.read().deviceId).not.toBe('mutated')
    expect(createEmptyMasteryState('device-test').schemaVersion).toBe(1)
  })
})
