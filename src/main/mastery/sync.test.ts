import { describe, expect, it } from 'vitest'
import { createEmptyMasteryState } from './repository'
import { mergeMasteryStates } from './sync'

describe('mastery sync merge', () => {
  it('preserves local and remote evidence across devices', () => {
    const local = createEmptyMasteryState('local-device')
    const remote = createEmptyMasteryState('remote-device')
    local.profile.evidence['local-evidence'] = { id: 'local-evidence', dedupeKey: 'local', conceptId: 'variables-and-scope', source: 'review', assessmentId: 'a', questionId: 'q1', independenceGroup: 'local', attempt: 1, score: 1, difficulty: 'easy', format: 'multiple_choice', occurredAt: '2026-07-19T01:00:00.000Z' }
    remote.profile.evidence['remote-evidence'] = { id: 'remote-evidence', dedupeKey: 'remote', conceptId: 'functions-and-parameters', source: 'review', assessmentId: 'b', questionId: 'q2', independenceGroup: 'remote', attempt: 1, score: 0.5, difficulty: 'medium', format: 'multiple_choice', occurredAt: '2026-07-19T02:00:00.000Z' }
    local.sync.pending = true

    const merged = mergeMasteryStates(local, remote, 'user-1', '2026-07-19T03:00:00.000Z')

    expect(Object.keys(merged.profile.evidence).sort()).toEqual(['local-evidence', 'remote-evidence'])
    expect(merged.sync.accountUserId).toBe('user-1')
    expect(merged.sync.pending).toBe(true)
  })

  it('builds a clean synced state when no remote row exists', () => {
    const local = createEmptyMasteryState('local-device')
    const merged = mergeMasteryStates(local, null, 'user-1', '2026-07-19T03:00:00.000Z')
    expect(merged.sync.accountUserId).toBe('user-1')
    expect(merged.deviceId).toBe('local-device')
  })
})
