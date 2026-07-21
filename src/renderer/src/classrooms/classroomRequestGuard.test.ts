import { describe, expect, it } from 'vitest'
import { isCurrentClassroomRequest } from './classroomRequestGuard'

describe('classroom request guard', () => {
  it('accepts only the latest response for the active classroom tab', () => {
    const mode = { kind: 'classrooms', classroomId: 'classroom-1', tab: 'assignments' } as const
    expect(isCurrentClassroomRequest(mode, 'classroom-1', 'assignments', 4, 4)).toBe(true)
    expect(isCurrentClassroomRequest(mode, 'classroom-1', 'assignments', 3, 4)).toBe(false)
    expect(isCurrentClassroomRequest(mode, 'classroom-2', 'assignments', 4, 4)).toBe(false)
    expect(isCurrentClassroomRequest(mode, 'classroom-1', 'analytics', 4, 4)).toBe(false)
  })

  it('rejects responses after leaving the classroom portal', () => {
    expect(isCurrentClassroomRequest({ kind: 'launcher' }, 'classroom-1', 'assignments', 1, 1)).toBe(false)
    expect(isCurrentClassroomRequest({ kind: 'sandbox' }, 'classroom-1', 'assignments', 1, 1)).toBe(false)
  })
})
