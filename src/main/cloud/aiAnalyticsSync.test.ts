import { describe, expect, it } from 'vitest'
import { AiAnalyticsSyncQueue, type AiAnalyticsSyncEvent } from './aiAnalyticsSync'

class MemoryStorage {
  value: unknown
  get(): unknown { return this.value }
  set(_key: string, value: unknown): void { this.value = value }
}

const requestEvent: AiAnalyticsSyncEvent = {
  eventKey: '11111111-1111-4111-8111-111111111111',
  classroomId: '22222222-2222-4222-8222-222222222222',
  studentId: '33333333-3333-4333-8333-333333333333',
  assignmentId: '44444444-4444-4444-8444-444444444444',
  sessionId: '55555555-5555-4555-8555-555555555555',
  eventType: 'request',
  mode: 'agent',
  requestLength: 240,
  requestScope: 'small',
  quizQuestionCount: 2,
  quizScore: null,
  passed: null,
  model: 'gpt-test',
  inputTokens: 100,
  cachedInputTokens: 25,
  outputTokens: 50,
  reasoningOutputTokens: 10,
  totalTokens: 150,
  reportedCredits: null,
  occurredAt: '2026-07-20T00:00:00.000Z'
}

describe('AiAnalyticsSyncQueue', () => {
  it('ignores corrupt persistence and deduplicates event keys', () => {
    const storage = new MemoryStorage()
    storage.value = { schemaVersion: 99, items: [{ request: 'must not persist' }] }
    const queue = new AiAnalyticsSyncQueue(storage)
    queue.enqueue(requestEvent)
    queue.enqueue(requestEvent)
    expect(queue.pendingCount()).toBe(1)
  })

  it('retains failed events and removes successful retries', async () => {
    const queue = new AiAnalyticsSyncQueue(new MemoryStorage())
    queue.enqueue(requestEvent)
    await queue.flush(async () => { throw new Error('offline') })
    expect(queue.pendingCount()).toBe(1)
    await queue.flush(async () => undefined)
    expect(queue.pendingCount()).toBe(0)
  })

  it('rejects conversation content and invalid event-specific fields', () => {
    const queue = new AiAnalyticsSyncQueue(new MemoryStorage())
    expect(() => queue.enqueue({ ...requestEvent, request: 'private prompt' } as AiAnalyticsSyncEvent)).toThrow()
    expect(() => queue.enqueue({ ...requestEvent, requestLength: null })).toThrow()
  })
})
