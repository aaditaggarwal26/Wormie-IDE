import { z } from 'zod'

const conceptSchema = z.object({
  conceptId: z.string().min(1).max(200),
  name: z.string().min(1).max(200),
  mastery: z.number().int().min(0).max(100),
  attempts: z.number().int().min(0).max(1_000_000),
  correct: z.number().int().min(0).max(1_000_000),
  updatedAt: z.string().datetime()
}).strict()

const eventSchema = z.object({
  eventKey: z.string().min(1).max(500),
  classroomId: z.uuid(),
  studentId: z.uuid(),
  assignmentId: z.uuid().nullable(),
  quizId: z.uuid(),
  attempt: z.number().int().min(1).max(100),
  score: z.number().int().min(0).max(100),
  passed: z.boolean(),
  source: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  completedAt: z.string().datetime(),
  concepts: z.array(conceptSchema).max(100)
}).strict()

export type MasterySyncEvent = z.infer<typeof eventSchema>

type SyncStorage = { get: (key: string) => unknown; set: (key: string, value: unknown) => void }

export class MasterySyncQueue {
  private readonly key = 'queue'
  private items: MasterySyncEvent[]
  private flushPromise: Promise<void> | null = null

  constructor(private readonly storage: SyncStorage) {
    const stored = storage.get(this.key)
    const parsed = z.object({ schemaVersion: z.literal(1), items: z.array(eventSchema).max(500) }).safeParse(stored)
    this.items = parsed.success ? parsed.data.items : []
    this.persist()
  }

  pendingCount(classroomId?: string): number {
    return classroomId ? this.items.filter((item) => item.classroomId === classroomId).length : this.items.length
  }

  enqueue(value: MasterySyncEvent): void {
    const event = eventSchema.parse(value)
    this.items = [...this.items.filter((item) => item.eventKey !== event.eventKey), event].slice(-500)
    this.persist()
  }

  flush(send: (event: MasterySyncEvent) => Promise<void>): Promise<void> {
    if (this.flushPromise) return this.flushPromise
    this.flushPromise = (async () => {
      const pending = [...this.items]
      for (const event of pending) {
        try {
          await send(event)
          this.items = this.items.filter((item) => item.eventKey !== event.eventKey)
          this.persist()
        } catch {
          // Keep failed events for the next authenticated retry.
        }
      }
    })().finally(() => { this.flushPromise = null })
    return this.flushPromise
  }

  private persist(): void { this.storage.set(this.key, { schemaVersion: 1, items: this.items }) }
}
