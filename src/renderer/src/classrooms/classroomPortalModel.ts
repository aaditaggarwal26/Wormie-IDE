import type { Classroom, ClassroomAiAnalyticsStudent } from '@shared/contracts'
import type { ClassroomPortalTab } from '../navigation/applicationMode'

export function groupClassrooms(classrooms: Classroom[]): { teaching: Classroom[]; enrolled: Classroom[] } {
  return {
    teaching: classrooms.filter((classroom) => classroom.role === 'teacher'),
    enrolled: classrooms.filter((classroom) => classroom.role === 'student')
  }
}

export function classroomTabsForRole(role: Classroom['role']): ClassroomPortalTab[] {
  return role === 'teacher' ? ['assignments', 'people', 'mastery', 'analytics', 'settings'] : ['assignments', 'people', 'mastery']
}

export function validClassroomTab(role: Classroom['role'], tab: ClassroomPortalTab): ClassroomPortalTab {
  return classroomTabsForRole(role).includes(tab) ? tab : 'assignments'
}

export function summarizeClassroomAnalytics(students: ClassroomAiAnalyticsStudent[]): ClassroomAiAnalyticsStudent {
  const requestCount = students.reduce((total, student) => total + student.requestCount, 0)
  const totalRequestCharacters = students.reduce((total, student) => total + student.totalRequestCharacters, 0)
  const quizAttemptCount = students.reduce((total, student) => total + student.quizAttemptCount, 0)
  const scoredAttempts = students.filter((student) => student.averageQuizScore !== null)
  const reportedCreditRows = students.filter((student) => student.reportedCredits !== null)
  return {
    studentId: 'classroom',
    requestCount,
    totalRequestCharacters,
    averageRequestCharacters: requestCount ? totalRequestCharacters / requestCount : 0,
    quizAttemptCount,
    quizQuestionCount: students.reduce((total, student) => total + student.quizQuestionCount, 0),
    averageQuizScore: quizAttemptCount && scoredAttempts.length
      ? scoredAttempts.reduce((total, student) => total + student.averageQuizScore! * student.quizAttemptCount, 0) / quizAttemptCount
      : null,
    requestScopes: {
      micro: students.reduce((total, student) => total + student.requestScopes.micro, 0),
      small: students.reduce((total, student) => total + student.requestScopes.small, 0),
      medium: students.reduce((total, student) => total + student.requestScopes.medium, 0),
      large: students.reduce((total, student) => total + student.requestScopes.large, 0)
    },
    inputTokens: students.reduce((total, student) => total + student.inputTokens, 0),
    cachedInputTokens: students.reduce((total, student) => total + student.cachedInputTokens, 0),
    outputTokens: students.reduce((total, student) => total + student.outputTokens, 0),
    reasoningOutputTokens: students.reduce((total, student) => total + student.reasoningOutputTokens, 0),
    totalTokens: students.reduce((total, student) => total + student.totalTokens, 0),
    reportedCredits: reportedCreditRows.length ? reportedCreditRows.reduce((total, student) => total + student.reportedCredits!, 0) : null,
    lastActivityAt: students.map((student) => student.lastActivityAt).filter((value): value is string => Boolean(value)).sort().at(-1) ?? null
  }
}
