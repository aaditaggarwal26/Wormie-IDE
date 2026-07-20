import { afterEach, describe, expect, it } from 'vitest'
import { useApplicationNavigation } from './applicationMode'

afterEach(() => useApplicationNavigation.getState().reset())

describe('application navigation', () => {
  it('starts at the authenticated launcher and enters explicit product modes', () => {
    expect(useApplicationNavigation.getState().mode).toEqual({ kind: 'launcher' })
    useApplicationNavigation.getState().openSandbox()
    expect(useApplicationNavigation.getState().mode).toEqual({ kind: 'sandbox' })
    useApplicationNavigation.getState().openClassrooms('classroom-1', 'people')
    expect(useApplicationNavigation.getState().mode).toEqual({
      kind: 'classrooms',
      classroomId: 'classroom-1',
      tab: 'people'
    })
  })

  it('rejects an assignment response from an obsolete transition', () => {
    const stale = useApplicationNavigation.getState().beginTransition()
    useApplicationNavigation.getState().openClassrooms()
    expect(useApplicationNavigation.getState().openAssignment(stale, {
      classroomId: 'classroom-1',
      classroomName: 'Web Systems',
      assignmentId: 'assignment-1',
      assignmentTitle: 'Sessions',
      role: 'student'
    })).toBe(false)
    expect(useApplicationNavigation.getState().mode.kind).toBe('classrooms')
  })

  it('returns Assignment IDE to its originating classroom', () => {
    const transitionId = useApplicationNavigation.getState().beginTransition()
    useApplicationNavigation.getState().openAssignment(transitionId, {
      classroomId: 'classroom-1',
      classroomName: 'Build Lab',
      assignmentId: 'assignment-1',
      assignmentTitle: 'Profile screen',
      role: 'student'
    })

    useApplicationNavigation.getState().leaveIde()

    expect(useApplicationNavigation.getState().mode).toEqual({
      kind: 'classrooms',
      classroomId: 'classroom-1',
      tab: 'assignments'
    })
  })
})
