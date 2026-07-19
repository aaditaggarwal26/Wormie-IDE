import { z } from 'zod'

export const learningDraftSchema = z.object({
  concepts: z.array(z.object({
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    whyItMatters: z.string().min(1).max(600),
    mentalModel: z.string().min(1).max(900),
    commonMistake: z.string().min(1).max(600)
  })).min(2).max(5),
  lessonSummary: z.string().min(1).max(2400),
  quiz: z.array(z.object({
    conceptId: z.string().min(1).max(100),
    prompt: z.string().min(1).max(600),
    options: z.array(z.string().min(1).max(300)).min(3).max(5),
    correctOption: z.number().int().min(0).max(4),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    explanation: z.string().min(1).max(600)
  })).min(3).max(5)
}).superRefine((value, context) => {
  const conceptIds = new Set(value.concepts.map((concept) => concept.id))
  value.quiz.forEach((question, index) => {
    if (!conceptIds.has(question.conceptId)) {
      context.addIssue({ code: 'custom', message: 'The question concept must reference a lesson concept.', path: ['quiz', index, 'conceptId'] })
    }
    if (question.correctOption >= question.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'The correct option must refer to an available answer.',
        path: ['quiz', index, 'correctOption']
      })
    }
  })
})

const proposalChangeBase = {
  relativePath: z.string().min(1).max(500),
  explanation: z.string().min(1).max(1000)
}

export const proposalDraftSchema = z.object({
  summary: z.string().min(1).max(1600),
  changes: z.array(z.discriminatedUnion('action', [
    z.object({
      ...proposalChangeBase,
      action: z.literal('create'),
      content: z.string().min(1).max(500_000)
    }),
    z.object({
      ...proposalChangeBase,
      action: z.literal('update'),
      edits: z.array(z.object({
        oldText: z.string().max(100_000),
        newText: z.string().max(100_000)
      })).min(1).max(100)
    })
  ])).min(1).max(12),
  risks: z.array(z.string().min(1).max(500)).max(10),
  verification: z.array(z.string().min(1).max(500)).min(1).max(10)
})

const workspacePath = z.string().min(1).max(500)

export const workspaceAgentStepSchema = z.object({
  note: z.string().min(1).max(500),
  action: z.discriminatedUnion('type', [
    z.object({
      type: z.literal('search'),
      query: z.string().min(1).max(200),
      path: z.string().max(500).optional()
    }),
    z.object({
      type: z.literal('read_file'),
      relativePath: workspacePath,
      startLine: z.number().int().positive().max(1_000_000).optional(),
      endLine: z.number().int().positive().max(1_000_000).optional()
    }),
    z.object({
      type: z.literal('edit_file'),
      relativePath: workspacePath,
      oldText: z.string().max(100_000),
      newText: z.string().max(100_000)
    }),
    z.object({
      type: z.literal('create_file'),
      relativePath: workspacePath,
      content: z.string().min(1).max(500_000)
    }),
    z.object({
      type: z.literal('run_check'),
      checkId: z.string().min(1).max(80)
    }),
    z.object({
      type: z.literal('finish'),
      summary: z.string().min(1).max(1600),
      explanations: z.array(z.object({
        relativePath: workspacePath,
        explanation: z.string().min(1).max(1000)
      })).min(1).max(12),
      risks: z.array(z.string().min(1).max(500)).max(10),
      verification: z.array(z.string().min(1).max(500)).max(10)
    })
  ])
})

export const changeConceptDraftSchema = z.object({
  concepts: z.array(z.object({
    id: z.string().min(1).max(80).regex(/^[a-z0-9._-]+$/i),
    name: z.string().min(1).max(100),
    summary: z.string().min(1).max(500),
    prerequisite: z.boolean().default(false)
  })).min(1).max(10),
  beforeBehavior: z.string().min(1).max(1200),
  afterBehavior: z.string().min(1).max(1200),
  importantSymbols: z.array(z.string().min(1).max(160)).max(20)
})

const sourceReferenceSchema = z.object({
  path: z.string().min(1).max(500),
  startLine: z.number().int().positive().max(1_000_000).optional(),
  endLine: z.number().int().positive().max(1_000_000).optional(),
  label: z.string().min(1).max(160).optional()
})

const quizOptionSchema = z.object({ id: z.string().min(1).max(80), label: z.string().min(1).max(400) })

const understandingQuestionDraftSchema = z.object({
  id: z.string().min(1).max(80),
  type: z.enum(['multiple_choice', 'multiple_select', 'true_false', 'predict_behavior', 'spot_the_bug', 'short_answer', 'code_ordering']),
  conceptId: z.string().min(1).max(80),
  prompt: z.string().min(1).max(900),
  code: z.string().max(8_000).optional(),
  options: z.array(quizOptionSchema).min(2).max(8).optional(),
  correctAnswer: z.union([z.string().max(4_000), z.array(z.string().max(160)).max(12), z.boolean()]),
  explanation: z.string().min(1).max(900),
  gradingRubric: z.string().min(1).max(1200).optional(),
  difficulty: z.enum(['easy', 'medium', 'hard']),
  sourceReferences: z.array(sourceReferenceSchema).min(1).max(5),
  weight: z.number().int().min(1).max(3)
}).superRefine((question, context) => {
  const selectable = ['multiple_choice', 'multiple_select', 'code_ordering'].includes(question.type)
  if (selectable && !question.options?.length) {
    context.addIssue({ code: 'custom', message: 'Selectable questions require options.', path: ['options'] })
    return
  }
  if (question.options) {
    const optionIds = new Set(question.options.map((option) => option.id))
    const answers = Array.isArray(question.correctAnswer) ? question.correctAnswer : [question.correctAnswer]
    if (selectable && answers.some((answer) => typeof answer !== 'string' || !optionIds.has(answer))) {
      context.addIssue({ code: 'custom', message: 'Correct answers must reference available options.', path: ['correctAnswer'] })
    }
  }
  if (question.type === 'true_false' && typeof question.correctAnswer !== 'boolean') {
    context.addIssue({ code: 'custom', message: 'True/false answers must be boolean.', path: ['correctAnswer'] })
  }
  if (['short_answer', 'predict_behavior', 'spot_the_bug'].includes(question.type) && !question.gradingRubric) {
    context.addIssue({ code: 'custom', message: 'Written questions require a grading rubric.', path: ['gradingRubric'] })
  }
})

export const understandingQuizDraftSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(1600),
  whyThisMatters: z.string().min(1).max(1000),
  flowSummary: z.string().min(1).max(1200),
  risks: z.array(z.string().min(1).max(500)).max(8),
  concepts: z.array(z.object({
    id: z.string().min(1).max(80),
    name: z.string().min(1).max(100),
    summary: z.string().min(1).max(500)
  })).min(1).max(10),
  questions: z.array(understandingQuestionDraftSchema).min(2).max(8)
}).superRefine((draft, context) => {
  const conceptIds = new Set(draft.concepts.map((concept) => concept.id))
  const questionIds = new Set<string>()
  draft.questions.forEach((question, index) => {
    if (!conceptIds.has(question.conceptId)) context.addIssue({ code: 'custom', message: 'Question concept must exist.', path: ['questions', index, 'conceptId'] })
    if (questionIds.has(question.id)) context.addIssue({ code: 'custom', message: 'Question IDs must be unique.', path: ['questions', index, 'id'] })
    questionIds.add(question.id)
  })
})

export const semanticGradeSchema = z.object({
  score: z.number().min(0).max(100),
  isCorrect: z.boolean(),
  demonstratedConcepts: z.array(z.string().min(1).max(160)).max(12),
  missingConcepts: z.array(z.string().min(1).max(160)).max(12),
  misconceptions: z.array(z.string().min(1).max(300)).max(8),
  feedback: z.string().min(1).max(900)
})

export const remediationDraftSchema = z.object({
  lesson: z.string().min(1).max(1600)
})

export const reviewDraftSchema = z.object({
  title: z.string().min(1).max(160),
  questions: z.array(z.object({
    prompt: z.string().min(1).max(900),
    options: z.array(z.string().min(1).max(400)).min(3).max(5),
    correctOption: z.number().int().min(0).max(4),
    difficulty: z.enum(['easy', 'medium', 'hard']),
    explanation: z.string().min(1).max(900)
  })).min(3).max(5)
}).superRefine((value, context) => value.questions.forEach((question, index) => {
  if (question.correctOption >= question.options.length) context.addIssue({ code: 'custom', message: 'The correct option must reference an available answer.', path: ['questions', index, 'correctOption'] })
}))

export type LearningDraft = z.infer<typeof learningDraftSchema>
export type ProposalDraft = z.infer<typeof proposalDraftSchema>
export type WorkspaceAgentStep = z.infer<typeof workspaceAgentStepSchema>
export type ChangeConceptDraft = z.infer<typeof changeConceptDraftSchema>
export type UnderstandingQuizDraft = z.infer<typeof understandingQuizDraftSchema>
export type SemanticGradeDraft = z.infer<typeof semanticGradeSchema>
export type RemediationDraft = z.infer<typeof remediationDraftSchema>
export type ReviewDraft = z.infer<typeof reviewDraftSchema>
