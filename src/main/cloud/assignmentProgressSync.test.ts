import { describe, expect, it } from 'vitest'
import { AssignmentProgressSyncQueue, type AssignmentProgressSyncEvent } from './assignmentProgressSync'

class MemoryStorage {
  value: unknown
  get(): unknown { return this.value }
  set(_key: string, value: unknown): void { this.value = value }
}

const event: AssignmentProgressSyncEvent = {
  classroomId: '11111111-1111-4111-8111-111111111111',
  assignmentId: '22222222-2222-4222-8222-222222222222',
  studentId: '33333333-3333-4333-8333-333333333333',
  localAssignmentId: '44444444-4444-4444-8444-444444444444',
  assignmentRevision: 'a'.repeat(64),
  progressRevision: 'b'.repeat(64),
  completedTasks: 1,
  totalTasks: 4,
  startedAt: '2026-07-21T12:00:00.000Z'
}

describe('AssignmentProgressSyncQueue', () => {
  it('ignores corrupt persistence and keeps only the latest assignment progress', () => {
    const storage = new MemoryStorage()
    storage.value = { schemaVersion: 99, items: [{ privateData: true }] }
    const queue = new AssignmentProgressSyncQueue(storage)
    queue.enqueue(event)
    queue.enqueue({ ...event, progressRevision: 'c'.repeat(64), completedTasks: 2 })

    expect(queue.pendingCount()).toBe(1)
    expect(storage.value).toMatchObject({
      schemaVersion: 1,
      items: [{ progressRevision: 'c'.repeat(64), completedTasks: 2 }]
    })
  })

  it('retains failed progress and removes it after a successful retry', async () => {
    const queue = new AssignmentProgressSyncQueue(new MemoryStorage())
    queue.enqueue(event)
    await queue.flush(async () => { throw new Error('offline') })
    expect(queue.pendingCount()).toBe(1)
    await queue.flush(async () => undefined)
    expect(queue.pendingCount()).toBe(0)
  })

  it('does not delete a newer event enqueued while an older event is sending', async () => {
    const storage = new MemoryStorage()
    const queue = new AssignmentProgressSyncQueue(storage)
    queue.enqueue(event)
    await queue.flush(async () => {
      queue.enqueue({ ...event, progressRevision: 'c'.repeat(64), completedTasks: 2 })
    })

    expect(queue.pendingCount()).toBe(1)
    expect(storage.value).toMatchObject({ items: [{ progressRevision: 'c'.repeat(64) }] })
    await queue.flush(async () => undefined)
    expect(queue.pendingCount()).toBe(0)
  })

  it('rejects invalid task totals and identifiers', () => {
    const queue = new AssignmentProgressSyncQueue(new MemoryStorage())
    expect(() => queue.enqueue({ ...event, completedTasks: 5 })).toThrow()
    expect(() => queue.enqueue({ ...event, studentId: 'not-a-user' })).toThrow()
  })
})
