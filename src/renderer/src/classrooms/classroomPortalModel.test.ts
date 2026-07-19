import { describe, expect, it } from 'vitest'
import type { Classroom } from '@shared/contracts'
import { classroomTabsForRole, groupClassrooms, validClassroomTab } from './classroomPortalModel'

const classroom = (id: string, role: Classroom['role']): Classroom => ({
  id,
  name: id,
  description: '',
  ownerId: 'teacher',
  role,
  inviteCode: null,
  inviteLink: null,
  createdAt: '2026-07-19T00:00:00.000Z',
  members: [],
  assignments: []
})

describe('classroom portal model', () => {
  it('groups teaching and enrolled classrooms without changing their order', () => {
    const result = groupClassrooms([classroom('student-a', 'student'), classroom('teacher-a', 'teacher'), classroom('student-b', 'student')])
    expect(result.teaching.map((item) => item.id)).toEqual(['teacher-a'])
    expect(result.enrolled.map((item) => item.id)).toEqual(['student-a', 'student-b'])
  })

  it('keeps teacher settings private from student navigation', () => {
    expect(classroomTabsForRole('teacher')).toEqual(['assignments', 'people', 'settings'])
    expect(classroomTabsForRole('student')).toEqual(['assignments', 'people'])
    expect(validClassroomTab('student', 'settings')).toBe('assignments')
  })
})
