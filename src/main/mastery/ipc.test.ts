import { describe, expect, it, vi } from 'vitest'
import { createMasteryHandlers, evidencePageRequestSchema, goalInputSchema } from './ipc'

describe('mastery IPC validation', () => {
  it('bounds pagination and goal inputs', () => {
    expect(evidencePageRequestSchema.parse({ page: 1, pageSize: 100 }).pageSize).toBe(100)
    expect(() => evidencePageRequestSchema.parse({ page: 0, pageSize: 101 })).toThrow()
    expect(() => goalInputSchema.parse({ id: '../bad', title: 'x', type: 'xp', target: 1 })).toThrow()
  })

  it('rejects untrusted renderer senders before calling the service', async () => {
    const service = { getOverview: vi.fn() }
    const handlers = createMasteryHandlers(service as never, () => false)
    await expect(handlers.overview({ sender: { id: 1 } } as never)).rejects.toThrow(/denied/i)
    expect(service.getOverview).not.toHaveBeenCalled()
  })
})
