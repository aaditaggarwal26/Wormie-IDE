import { describe, expect, it } from 'vitest'
import { sanitizeAgentActivity } from './activity'

describe('sanitizeAgentActivity', () => {
  it('bounds details and file metadata while dropping unknown protocol names', () => {
    const event = sanitizeAgentActivity({
      id: 'event-1',
      runId: 'run-1',
      timestamp: '2026-07-15T00:00:00.000Z',
      kind: 'protocol',
      phase: 'model',
      label: 'Receiving Codex response',
      state: 'active',
      detail: 'x'.repeat(500),
      protocolMethod: 'secret/custom-method',
      files: Array.from({ length: 80 }, (_, index) => ({ path: `src/${index}.ts`, action: 'update' as const }))
    })

    expect(event.detail).toHaveLength(240)
    expect(event.protocolMethod).toBeUndefined()
    expect(event.files).toHaveLength(50)
  })

  it('keeps allowlisted protocol methods and strips unsafe control characters', () => {
    const event = sanitizeAgentActivity({
      id: 'event-1\nsecret',
      runId: 'run-1',
      timestamp: 'not-a-date',
      kind: 'protocol',
      phase: 'model',
      label: 'Receiving\nresponse',
      state: 'active',
      protocolMethod: 'item/completed'
    })

    expect(event.id).toBe('event-1secret')
    expect(event.label).toBe('Receiving response')
    expect(event.protocolMethod).toBe('item/completed')
    expect(Number.isNaN(Date.parse(event.timestamp))).toBe(false)
  })

  it('rejects malformed identifiers and enum values', () => {
    expect(() => sanitizeAgentActivity({
      id: '', runId: '', timestamp: '', kind: 'secret', phase: 'private', label: '', state: 'unknown'
    })).toThrow('Invalid agent activity event')
  })
})
