import { describe, expect, it } from 'vitest'
import { usesAssignmentPolicy } from './workspacePurpose'

describe('workspace purpose', () => {
  it('does not attach assignment policy to a sandbox workspace', () => {
    expect(usesAssignmentPolicy('sandbox')).toBe(false)
    expect(usesAssignmentPolicy('assignment')).toBe(true)
  })
})
