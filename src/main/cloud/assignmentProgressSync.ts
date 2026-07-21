import { z } from 'zod'

const progressEventSchema = z.object({
  classroomId: z.uuid(),
  assignmentId: z.uuid(),
  studentId: z.uuid(),
  localAssignmentId: z.uuid(),
  assignmentRevision: z.string().regex(/^[a-f0-9]{64}$/),
  progressRevision: z.string().regex(/^[a-f0-9]{64}$/),
  completedTasks: z.number().int().min(0).max(50),
  totalTasks: z.number().int().min(1).max(50),
  startedAt: z.string().datetime({ offset: true })
}).strict().refine((event) => event.completedTasks <= event.totalTasks, {
  message: 'Completed tasks cannot exceed total tasks.'
})

export type AssignmentProgressSyncEvent = z.infer<typeof progressEventSchema>

type SyncStorage = { get: (key: string) => unknown; set: (key: string, value: unknown) => void }

function eventKey(event: AssignmentProgressSyncEvent): string {
  return `${event.classroomId}:${event.assignmentId}:${event.studentId}`
}

export class AssignmentProgressSyncQueue {
  private readonly key = 'queue'
  private items: AssignmentProgressSyncEvent[]
  private flushPromise: Promise<void> | null = null

  constructor(private readonly storage: SyncStorage) {
    const parsed = z.object({ schemaVersion: z.literal(1), items: z.array(progressEventSchema).max(500) }).safeParse(storage.get(this.key))
    this.items = parsed.success ? parsed.data.items : []
    this.persist()
  }

  pendingCount(classroomId?: string): number {
    return classroomId ? this.items.filter((item) => item.classroomId === classroomId).length : this.items.length
  }

  enqueue(value: AssignmentProgressSyncEvent): void {
    const event = progressEventSchema.parse(value)
    const key = eventKey(event)
    this.items = [...this.items.filter((item) => eventKey(item) !== key), event].slice(-500)
    this.persist()
  }

  flush(send: (event: AssignmentProgressSyncEvent) => Promise<void>): Promise<void> {
    if (this.flushPromise) return this.flushPromise
    this.flushPromise = (async () => {
      for (const event of [...this.items]) {
        try {
          await send(event)
          this.items = this.items.filter((item) => eventKey(item) !== eventKey(event) || item.progressRevision !== event.progressRevision)
          this.persist()
        } catch {
          // Keep failed progress for the next authenticated retry.
        }
      }
    })().finally(() => { this.flushPromise = null })
    return this.flushPromise
  }

  private persist(): void {
    this.storage.set(this.key, { schemaVersion: 1, items: this.items })
  }
}
