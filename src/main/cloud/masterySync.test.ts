import { describe, expect, it } from 'vitest'
import { MasterySyncQueue, type MasterySyncEvent } from './masterySync'

class MemoryStorage {
  value: unknown
  get(): unknown { return this.value }
  set(_key: string, value: unknown): void { this.value = value }
}

const event: MasterySyncEvent = {
  eventKey: 'class:user:quiz:1',
  classroomId: '11111111-1111-4111-8111-111111111111',
  studentId: '22222222-2222-4222-8222-222222222222',
  assignmentId: '33333333-3333-4333-8333-333333333333',
  quizId: '44444444-4444-4444-8444-444444444444',
  attempt: 1,
  score: 80,
  passed: true,
  source: 'ai_proposal',
  title: 'Sessions',
  completedAt: '2026-07-19T00:00:00.000Z',
  concepts: [{ conceptId: 'auth', name: 'Authentication', mastery: 72, attempts: 2, correct: 1, updatedAt: '2026-07-19T00:00:00.000Z' }]
}

describe('MasterySyncQueue', () => {
  it('ignores corrupt persistence and deduplicates events', () => {
    const storage = new MemoryStorage()
    storage.value = { schemaVersion: 99, items: [{ secret: true }] }
    const queue = new MasterySyncQueue(storage)
    queue.enqueue(event)
    queue.enqueue(event)
    expect(queue.pendingCount()).toBe(1)
  })

  it('retains failed events and removes successful retries', async () => {
    const queue = new MasterySyncQueue(new MemoryStorage())
    queue.enqueue(event)
    await queue.flush(async () => { throw new Error('offline') })
    expect(queue.pendingCount()).toBe(1)
    await queue.flush(async () => undefined)
    expect(queue.pendingCount()).toBe(0)
  })
})
