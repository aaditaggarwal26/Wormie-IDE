import { describe, expect, it } from 'vitest'
import type { ChangeInput, PrivateQuizQuestion, UnderstandingQuiz } from '../../shared/contracts'
import { UnderstandingGateService } from './gate'
import { fingerprintChange } from './fingerprint'
import { classifyChange, defaultUnderstandingSettings } from './significance'
import { UnderstandingRepository } from './store'

class MemoryStorage {
  value: unknown
  get(): unknown { return this.value }
  set(_key: string, value: unknown): void { this.value = value }
}

const change: ChangeInput = {
  id: 'proposal-1', source: 'ai_proposal', title: 'Protect session handling', files: [
    { path: 'src/auth/session.ts', status: 'modified', additions: 10, deletions: 3, patch: '+httpOnly: true' }
  ]
}
const privateQuestions: PrivateQuizQuestion[] = [
  { id: 'q1', type: 'multiple_choice', conceptId: 'auth', prompt: 'Why httpOnly?', options: [{ id: 'xss', label: 'Limits script access' }, { id: 'style', label: 'Changes CSS' }], correctAnswer: 'xss', explanation: 'It limits script access.', difficulty: 'medium', sourceReferences: [{ path: 'src/auth/session.ts' }], weight: 1 }
]

function quiz(): UnderstandingQuiz {
  const significance = classifyChange(change, defaultUnderstandingSettings)
  return {
    id: 'quiz-1', changeId: change.id, source: change.source, fingerprint: fingerprintChange(change), diffFingerprint: fingerprintChange(change), quizVersion: 1, promptVersion: 'test-v1', modelIdentifier: 'test-model',
    title: change.title, summary: 'Session cookies are now script-inaccessible.', whyThisMatters: 'This changes the security boundary.', flowSummary: 'Request -> session middleware -> cookie.', risks: ['Incorrect flags can break sign-in.'], concepts: [{ id: 'auth', name: 'Cookie security', summary: 'Browser cookie boundaries.' }],
    questions: privateQuestions.map(({ correctAnswer: _correct, explanation: _explanation, gradingRubric: _rubric, weight: _weight, ...question }) => question),
    passingScore: 80, estimatedMinutes: 2, significance, createdAt: '2026-07-14T00:00:00.000Z', updatedAt: '2026-07-14T00:00:00.000Z'
  }
}

describe('UnderstandingGateService', () => {
  it('restores an autosaved in-progress gate after restart', () => {
    const storage = new MemoryStorage()
    const first = new UnderstandingGateService(new UnderstandingRepository(storage))
    first.createGate(change, quiz(), privateQuestions)
    first.saveAnswers('quiz-1', { q1: { value: 'style' } })
    const restored = new UnderstandingGateService(new UnderstandingRepository(storage)).getStatus(change.id, fingerprintChange(change))
    expect(restored?.state).toBe('in_progress')
    expect(restored?.draftAnswers.q1.value).toBe('style')
  })

  it('unlocks only the exact fingerprint after a passing answer', async () => {
    const service = new UnderstandingGateService(new UnderstandingRepository(new MemoryStorage()))
    service.createGate(change, quiz(), privateQuestions)
    const result = await service.submit({ quizId: 'quiz-1', answers: { q1: { value: 'xss' } } })
    expect(result.passed).toBe(true)
    expect(service.assertUnlocked(change.id, change.source, fingerprintChange(change))).toBeUndefined()
    expect(() => service.assertUnlocked(change.id, change.source, 'materially-edited')).toThrow(/changed/i)
  })

  it('moves a failed retry to targeted remediation', async () => {
    const service = new UnderstandingGateService(new UnderstandingRepository(new MemoryStorage()), undefined, async () => 'Trace the cookie boundary from middleware to browser storage, then explain the XSS consequence.')
    service.createGate(change, quiz(), privateQuestions)
    await service.submit({ quizId: 'quiz-1', answers: { q1: { value: 'style' } } })
    const second = await service.submit({ quizId: 'quiz-1', answers: { q1: { value: 'style' } } })
    expect(second.passed).toBe(false)
    expect(second.remediation).toMatch(/cookie boundary/i)
    expect(service.getStatus(change.id, fingerprintChange(change))?.state).toBe('remediation')
  })

  it('audits configured bypasses and rejects strict critical bypasses', () => {
    const repository = new UnderstandingRepository(new MemoryStorage())
    repository.setSettings({ ...defaultUnderstandingSettings, developerBypass: true })
    const service = new UnderstandingGateService(repository)
    service.createGate(change, quiz(), privateQuestions)
    expect(service.bypass('quiz-1', 'Reviewed during incident response').state).toBe('bypassed')
    expect(repository.read().history[0].bypassReason).toBe('Reviewed during incident response')

    repository.setSettings({ ...defaultUnderstandingSettings, developerBypass: true, strictMode: true })
    const criticalQuiz = { ...quiz(), id: 'quiz-2', significance: { ...quiz().significance, level: 'critical' as const } }
    service.createGate({ ...change, id: 'critical' }, { ...criticalQuiz, changeId: 'critical' }, privateQuestions)
    expect(() => service.bypass('quiz-2', 'No')).toThrow(/strict mode/i)
  })

  it('records rejection without persisting source code or filenames in telemetry', () => {
    const repository = new UnderstandingRepository(new MemoryStorage())
    const service = new UnderstandingGateService(repository)
    service.recordRejected(change, classifyChange(change, defaultUnderstandingSettings))
    expect(repository.read().history[0].outcome).toBe('rejected')
    expect(JSON.stringify(repository.read().auditEvents)).not.toContain('session.ts')
  })

  it('requires every hard critical question and updates mastery gradually', async () => {
    const service = new UnderstandingGateService(new UnderstandingRepository(new MemoryStorage()))
    const criticalQuestions: PrivateQuizQuestion[] = [
      privateQuestions[0],
      { ...privateQuestions[0], id: 'q2', difficulty: 'hard', correctAnswer: 'xss', weight: 3 }
    ]
    const criticalQuiz = { ...quiz(), id: 'quiz-critical', significance: { ...quiz().significance, level: 'critical' as const }, passingScore: 20, questions: criticalQuestions.map(({ correctAnswer: _c, explanation: _e, weight: _w, ...question }) => question) }
    service.createGate(change, criticalQuiz, criticalQuestions)
    const result = await service.submit({ quizId: criticalQuiz.id, answers: { q1: { value: 'xss' }, q2: { value: 'style' } } })
    expect(result.score).toBe(25)
    expect(result.passed).toBe(false)
    const mastery = service.getHistory().mastery[0]
    expect(mastery.mastery).toBeGreaterThan(40)
    expect(mastery.mastery).toBeLessThan(60)
    expect(mastery.evidenceQuizIds).toContain(criticalQuiz.id)
  })

  it('preserves answers without consuming an attempt when semantic grading fails', async () => {
    const open: PrivateQuizQuestion = { id: 'open', type: 'short_answer', conceptId: 'auth', prompt: 'Explain', correctAnswer: 'rubric', gradingRubric: 'Mention script access.', explanation: 'Cookie boundary.', difficulty: 'hard', sourceReferences: [{ path: 'src/auth/session.ts' }], weight: 2 }
    const service = new UnderstandingGateService(new UnderstandingRepository(new MemoryStorage()), async () => { throw new Error('Provider unavailable') })
    const openQuiz = { ...quiz(), id: 'quiz-open', questions: [(({ correctAnswer: _c, explanation: _e, gradingRubric: _r, weight: _w, ...question }) => question)(open)] }
    service.createGate(change, openQuiz, [open])
    await expect(service.submit({ quizId: openQuiz.id, answers: { open: { value: 'It prevents renderer script access.' } } })).rejects.toThrow(/Provider unavailable/)
    const restored = service.getStatus(change.id, fingerprintChange(change))
    expect(restored?.draftAnswers.open.value).toMatch(/renderer/)
    expect(restored?.lastResult).toBeNull()
  })

  it('keeps classroom mastery separate from sandbox mastery and emits a sync event', async () => {
    const repository = new UnderstandingRepository(new MemoryStorage())
    const service = new UnderstandingGateService(repository, undefined, undefined, () => ({
      classroomId: 'classroom-1',
      assignmentId: 'assignment-1',
      userId: 'student-1'
    }))
    let completionClassroom: string | null = null
    service.setCompletionListener((completion) => { completionClassroom = completion.scope.classroomId })
    service.createGate(change, quiz(), privateQuestions)

    await service.submit({ quizId: 'quiz-1', answers: { q1: { value: 'xss' } } })

    expect(repository.read().mastery).toEqual({})
    expect(repository.read().classroomMastery['classroom-1:student-1'].auth.mastery).toBeGreaterThan(50)
    expect(service.getHistory().mastery[0].conceptId).toBe('auth')
    expect(completionClassroom).toBe('classroom-1')
  })

  it('keeps the same student mastery independent across classrooms', async () => {
    const repository = new UnderstandingRepository(new MemoryStorage())
    let classroomId = 'classroom-1'
    const service = new UnderstandingGateService(repository, undefined, undefined, () => ({ classroomId, assignmentId: null, userId: 'student-1' }))
    service.createGate(change, quiz(), privateQuestions)
    await service.submit({ quizId: 'quiz-1', answers: { q1: { value: 'xss' } } })

    classroomId = 'classroom-2'
    service.createGate(change, { ...quiz(), id: 'quiz-2', questions: quiz().questions.map((question) => ({ ...question, id: question.id.replace('quiz-1', 'quiz-2') })) }, privateQuestions)
    await service.submit({ quizId: 'quiz-2', answers: { q1: { value: 'style' } } })

    const state = repository.read()
    expect(state.classroomMastery['classroom-1:student-1'].auth.mastery).not.toBe(state.classroomMastery['classroom-2:student-1'].auth.mastery)
  })

  it('keeps local mastery private between students in the same classroom', async () => {
    const repository = new UnderstandingRepository(new MemoryStorage())
    let userId = 'student-1'
    const service = new UnderstandingGateService(repository, undefined, undefined, () => ({ classroomId: 'classroom-1', assignmentId: null, userId }))
    service.createGate(change, quiz(), privateQuestions)
    await service.submit({ quizId: 'quiz-1', answers: { q1: { value: 'xss' } } })

    userId = 'student-2'
    expect(service.getHistory()).toEqual({ history: [], mastery: [] })
  })
})
