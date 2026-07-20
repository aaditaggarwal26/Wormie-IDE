import { describe, expect, it } from 'vitest'
import { learningDraftSchema } from './schemas'

const question = {
  conceptId: 'javascript.rendering',
  prompt: 'What existing rendering pattern should the change preserve?',
  options: ['The current component pattern', 'A new framework', 'An unrelated redesign'],
  correctOption: 0,
  difficulty: 'medium' as const,
  explanation: 'The requested behavior should follow the existing implementation.'
}

function draft(requestScope: 'micro' | 'small' | 'medium' | 'large', questionCount: number) {
  return {
    requestScope,
    concepts: [
      {
        id: 'javascript.rendering',
        name: 'Rendering patterns',
        whyItMatters: 'The requested element should fit the existing rendering flow.',
        mentalModel: 'Reuse the established component structure.',
        commonMistake: 'Redesigning unrelated parts of the screen.'
      },
      {
        id: 'javascript.data-flow',
        name: 'Data flow',
        whyItMatters: 'The rendered value must come from the existing profile data.',
        mentalModel: 'Data enters the component and is rendered in one focused location.',
        commonMistake: 'Changing unrelated data structures.'
      }
    ],
    lessonSummary: 'Preserve the existing rendering and data-flow patterns.',
    quiz: Array.from({ length: questionCount }, () => ({ ...question }))
  }
}

describe('adaptive learning-check scope', () => {
  it.each([
    ['micro', 1],
    ['small', 2],
    ['medium', 3],
    ['large', 4]
  ] as const)('requires %s requests to produce %i questions', (scope, questionCount) => {
    expect(learningDraftSchema.safeParse(draft(scope, questionCount)).success).toBe(true)
  })

  it('rejects a quiz count that does not match the classified request scope', () => {
    const result = learningDraftSchema.safeParse(draft('micro', 4))

    expect(result.success).toBe(false)
  })
})
