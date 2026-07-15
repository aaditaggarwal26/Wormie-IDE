import { describe, expect, it } from 'vitest'
import { remediationDraftSchema, semanticGradeSchema, understandingQuizDraftSchema } from '../agent/schemas'

const baseQuestion = {
  id: 'q1', type: 'multiple_choice', conceptId: 'ipc', prompt: 'Which process validates the path?',
  options: [{ id: 'main', label: 'Main process' }, { id: 'renderer', label: 'Renderer only' }],
  correctAnswer: 'main', explanation: 'The trusted main process validates it.', difficulty: 'medium',
  sourceReferences: [{ path: 'src/main/files.ts', startLine: 12 }], weight: 1
}

const draft = {
  title: 'Secure file bridge', summary: 'Adds a validated file bridge.', whyThisMatters: 'It changes a trust boundary.',
  flowSummary: 'Renderer request -> preload -> main validation -> filesystem.', risks: ['Unvalidated paths could escape the workspace.'],
  concepts: [{ id: 'ipc', name: 'Electron IPC', summary: 'Messages cross process boundaries.' }], questions: [baseQuestion, { ...baseQuestion, id: 'q2' }, { ...baseQuestion, id: 'q3' }]
}

describe('understanding AI schemas', () => {
  it('accepts grounded multi-format quiz data', () => {
    const parsed = understandingQuizDraftSchema.parse({ ...draft, questions: [
      baseQuestion,
      { ...baseQuestion, id: 'q2', type: 'multiple_select', correctAnswer: ['main'], difficulty: 'hard' },
      { ...baseQuestion, id: 'q3', type: 'short_answer', options: undefined, correctAnswer: 'Must mention main-process validation', gradingRubric: 'Accept equivalent descriptions.', difficulty: 'hard' }
    ] })
    expect(parsed.questions).toHaveLength(3)
  })

  it('rejects selectable questions whose answer references a missing option', () => {
    expect(() => understandingQuizDraftSchema.parse({ ...draft, questions: [{ ...baseQuestion, correctAnswer: 'missing' }, { ...baseQuestion, id: 'q2' }, { ...baseQuestion, id: 'q3' }] })).toThrow()
  })

  it('rejects source references without a file path', () => {
    expect(() => understandingQuizDraftSchema.parse({ ...draft, questions: [{ ...baseQuestion, sourceReferences: [{ path: '' }] }, { ...baseQuestion, id: 'q2' }, { ...baseQuestion, id: 'q3' }] })).toThrow()
  })

  it('strictly validates semantic grading output', () => {
    const grade = { score: 92, isCorrect: true, demonstratedConcepts: ['main-process validation'], missingConcepts: [], misconceptions: [], feedback: 'Equivalent answer.' }
    expect(semanticGradeSchema.parse(grade).isCorrect).toBe(true)
    expect(() => semanticGradeSchema.parse({ correct: 'yes', explanation: '' })).toThrow()
  })

  it('bounds focused remediation output', () => {
    expect(remediationDraftSchema.parse({ lesson: 'Trace the failing branch, then revisit the changed contract.' }).lesson).toMatch(/Trace/)
    expect(() => remediationDraftSchema.parse({ lesson: '' })).toThrow()
  })
})
