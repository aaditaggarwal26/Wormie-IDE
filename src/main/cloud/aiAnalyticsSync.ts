import { z } from 'zod'

export const requestScopeSchema = z.enum(['micro', 'small', 'medium', 'large'])

const eventSchema = z.object({
  eventKey: z.uuid(),
  classroomId: z.uuid(),
  studentId: z.uuid(),
  assignmentId: z.uuid(),
  sessionId: z.uuid(),
  eventType: z.enum(['request', 'quiz', 'usage']),
  mode: z.enum(['ask', 'plan', 'agent']).nullable(),
  requestLength: z.number().int().min(1).max(4_000).nullable(),
  requestScope: requestScopeSchema.nullable(),
  quizQuestionCount: z.number().int().min(0).max(100).nullable(),
  quizScore: z.number().min(0).max(100).nullable(),
  passed: z.boolean().nullable(),
  model: z.string().min(1).max(200),
  inputTokens: z.number().int().min(0).max(1_000_000_000),
  cachedInputTokens: z.number().int().min(0).max(1_000_000_000),
  outputTokens: z.number().int().min(0).max(1_000_000_000),
  reasoningOutputTokens: z.number().int().min(0).max(1_000_000_000),
  totalTokens: z.number().int().min(0).max(1_000_000_000),
  reportedCredits: z.number().min(0).max(1_000_000).nullable(),
  occurredAt: z.string().datetime()
}).strict().superRefine((event, context) => {
  if (event.eventType === 'request' && (event.requestLength === null || event.quizQuestionCount === null || event.quizScore !== null || event.passed !== null)) {
    context.addIssue({ code: 'custom', message: 'Request analytics fields are invalid.' })
  }
  if (event.eventType === 'quiz' && (event.requestLength !== null || event.requestScope !== null || event.quizQuestionCount === null || event.quizScore === null || event.passed === null)) {
    context.addIssue({ code: 'custom', message: 'Quiz analytics fields are invalid.' })
  }
  if (event.eventType === 'usage' && (event.mode !== null || event.requestLength !== null || event.requestScope !== null || event.quizQuestionCount !== null || event.quizScore !== null || event.passed !== null)) {
    context.addIssue({ code: 'custom', message: 'Usage analytics fields are invalid.' })
  }
})

export type AiAnalyticsSyncEvent = z.infer<typeof eventSchema>

type SyncStorage = { get: (key: string) => unknown; set: (key: string, value: unknown) => void }

export class AiAnalyticsSyncQueue {
  private readonly key = 'queue'
  private items: AiAnalyticsSyncEvent[]
  private flushPromise: Promise<void> | null = null

  constructor(private readonly storage: SyncStorage) {
    const parsed = z.object({ schemaVersion: z.literal(1), items: z.array(eventSchema).max(1_000) }).safeParse(storage.get(this.key))
    this.items = parsed.success ? parsed.data.items : []
    this.persist()
  }

  pendingCount(classroomId?: string): number {
    return classroomId ? this.items.filter((item) => item.classroomId === classroomId).length : this.items.length
  }

  enqueue(value: AiAnalyticsSyncEvent): void {
    const event = eventSchema.parse(value)
    this.items = [...this.items.filter((item) => item.eventKey !== event.eventKey), event].slice(-1_000)
    this.persist()
  }

  flush(send: (event: AiAnalyticsSyncEvent) => Promise<void>): Promise<void> {
    if (this.flushPromise) return this.flushPromise
    this.flushPromise = (async () => {
      for (const event of [...this.items]) {
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

  private persist(): void {
    this.storage.set(this.key, { schemaVersion: 1, items: this.items })
  }
}
