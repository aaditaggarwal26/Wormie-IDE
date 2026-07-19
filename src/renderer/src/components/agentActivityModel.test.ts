import { describe, expect, it } from 'vitest'
import { initialAgentActivityState, isRenderableAgentActivity, reduceAgentActivity } from './agentActivityModel'

describe('agent activity model', () => {
  it('replaces a phase row while retaining one ordered phase', () => {
    let state = initialAgentActivityState('run-1')
    state = reduceAgentActivity(state, {
      id: 'a', runId: 'run-1', timestamp: '2026-07-15T00:00:00.000Z',
      kind: 'phase', phase: 'model', label: 'Receiving', state: 'active'
    })
    state = reduceAgentActivity(state, {
      id: 'b', runId: 'run-1', timestamp: '2026-07-15T00:00:01.000Z',
      kind: 'phase', phase: 'model', label: 'Received', state: 'completed'
    })

    expect(state.phases).toHaveLength(1)
    expect(state.phases[0]).toMatchObject({ label: 'Received', state: 'completed' })
  })

  it('stops every spinning phase when a failure or stop arrives', () => {
    let state = initialAgentActivityState('run-1')
    state = reduceAgentActivity(state, {
      id: 'a', runId: 'run-1', timestamp: '2026-07-15T00:00:00.000Z',
      kind: 'phase', phase: 'context', label: 'Workspace context ready', state: 'completed'
    })
    state = reduceAgentActivity(state, {
      id: 'b', runId: 'run-1', timestamp: '2026-07-15T00:00:01.000Z',
      kind: 'phase', phase: 'learning', label: 'Preparing the learning plan', state: 'active'
    })
    state = reduceAgentActivity(state, {
      id: 'c', runId: 'run-1', timestamp: '2026-07-15T00:00:02.000Z',
      kind: 'phase', phase: 'model', label: 'AI request failed', state: 'failed'
    })

    expect(state.phases.find((phase) => phase.phase === 'context')?.state).toBe('completed')
    expect(state.phases.find((phase) => phase.phase === 'learning')?.state).toBe('stopped')
    expect(state.phases.find((phase) => phase.phase === 'model')?.state).toBe('failed')
  })

  it('ignores other runs and caps technical events at 120', () => {
    let state = initialAgentActivityState('run-1')
    state = reduceAgentActivity(state, {
      id: 'wrong', runId: 'run-2', timestamp: '2026-07-15T00:00:00.000Z',
      kind: 'phase', phase: 'model', label: 'Wrong run', state: 'active'
    })
    for (let index = 0; index < 130; index += 1) {
      state = reduceAgentActivity(state, {
        id: `${index}`, runId: 'run-1', timestamp: '2026-07-15T00:00:00.000Z',
        kind: 'protocol', phase: 'model', label: 'Protocol', state: 'active', protocolMethod: 'item/started'
      })
    }

    expect(state.phases).toHaveLength(0)
    expect(state.technical).toHaveLength(120)
    expect(state.technical[0].id).toBe('10')
  })

  it('replaces the file group for a phase', () => {
    let state = initialAgentActivityState('run-1')
    state = reduceAgentActivity(state, {
      id: 'files-a', runId: 'run-1', timestamp: '2026-07-15T00:00:00.000Z',
      kind: 'files', phase: 'proposal', label: 'Proposed files', state: 'completed',
      files: [{ path: 'src/a.ts', action: 'update' }]
    })
    state = reduceAgentActivity(state, {
      id: 'files-b', runId: 'run-1', timestamp: '2026-07-15T00:00:01.000Z',
      kind: 'files', phase: 'proposal', label: 'Proposed files', state: 'completed',
      files: [{ path: 'src/b.ts', action: 'create' }]
    })

    expect(state.files.proposal).toEqual([{ path: 'src/b.ts', action: 'create' }])
  })

  it('rejects malformed values at the renderer boundary', () => {
    expect(isRenderableAgentActivity({ kind: 'secret' })).toBe(false)
    expect(isRenderableAgentActivity({
      id: 'a', runId: 'run-1', timestamp: 'bad', kind: 'phase', phase: 'model', label: 'x', state: 'active'
    })).toBe(false)
  })
})
