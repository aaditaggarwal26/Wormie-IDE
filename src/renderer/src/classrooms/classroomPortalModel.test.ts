import { describe, expect, it } from 'vitest'
import type { Classroom } from '@shared/contracts'
import { classroomTabsForRole, groupClassrooms, summarizeClassroomAnalytics, validClassroomTab } from './classroomPortalModel'

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
    expect(classroomTabsForRole('teacher')).toEqual(['assignments', 'people', 'mastery', 'analytics', 'settings'])
    expect(classroomTabsForRole('student')).toEqual(['assignments', 'people', 'mastery'])
    expect(validClassroomTab('student', 'analytics')).toBe('assignments')
    expect(validClassroomTab('student', 'settings')).toBe('assignments')
  })

  it('weights classroom averages and preserves unavailable credit reporting', () => {
    const summary = summarizeClassroomAnalytics([
      { studentId: 'a', requestCount: 2, totalRequestCharacters: 200, averageRequestCharacters: 100, quizAttemptCount: 1, quizQuestionCount: 2, averageQuizScore: 80, requestScopes: { micro: 1, small: 1, medium: 0, large: 0 }, inputTokens: 100, cachedInputTokens: 20, outputTokens: 30, reasoningOutputTokens: 5, totalTokens: 130, reportedCredits: null, lastActivityAt: null },
      { studentId: 'b', requestCount: 1, totalRequestCharacters: 400, averageRequestCharacters: 400, quizAttemptCount: 2, quizQuestionCount: 6, averageQuizScore: 50, requestScopes: { micro: 0, small: 0, medium: 1, large: 0 }, inputTokens: 200, cachedInputTokens: 0, outputTokens: 40, reasoningOutputTokens: 0, totalTokens: 240, reportedCredits: null, lastActivityAt: null }
    ])
    expect(summary.averageRequestCharacters).toBe(200)
    expect(summary.averageQuizScore).toBe(60)
    expect(summary.requestScopes).toEqual({ micro: 1, small: 1, medium: 1, large: 0 })
    expect(summary.totalTokens).toBe(370)
    expect(summary.reportedCredits).toBeNull()
  })
})
