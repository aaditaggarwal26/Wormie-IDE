import { describe, expect, it } from 'vitest'
import { ensureWorkspaceRequestCurrent } from './workspaceTransition'

describe('workspace transition guard', () => {
  it('allows unguarded and current workspace operations', () => {
    expect(() => ensureWorkspaceRequestCurrent()).not.toThrow()
    expect(() => ensureWorkspaceRequestCurrent(() => true)).not.toThrow()
  })

  it('rejects an obsolete workspace operation before it can commit', () => {
    expect(() => ensureWorkspaceRequestCurrent(() => false)).toThrow('no longer active')
  })
})
