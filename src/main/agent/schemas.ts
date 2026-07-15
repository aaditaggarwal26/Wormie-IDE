import { z } from 'zod'

export const learningDraftSchema = z.object({
  concepts: z.array(z.object({
    name: z.string().min(1).max(80),
    whyItMatters: z.string().min(1).max(600),
    mentalModel: z.string().min(1).max(900),
    commonMistake: z.string().min(1).max(600)
  })).min(2).max(5),
  lessonSummary: z.string().min(1).max(2400),
  quiz: z.array(z.object({
    prompt: z.string().min(1).max(600),
    options: z.array(z.string().min(1).max(300)).min(3).max(5),
    correctOption: z.number().int().min(0).max(4),
    explanation: z.string().min(1).max(600)
  })).min(3).max(5)
}).superRefine((value, context) => {
  value.quiz.forEach((question, index) => {
    if (question.correctOption >= question.options.length) {
      context.addIssue({
        code: 'custom',
        message: 'The correct option must refer to an available answer.',
        path: ['quiz', index, 'correctOption']
      })
    }
  })
})

export const proposalDraftSchema = z.object({
  summary: z.string().min(1).max(1600),
  changes: z.array(z.object({
    relativePath: z.string().min(1).max(500),
    action: z.enum(['create', 'update']),
    content: z.string().max(500_000),
    explanation: z.string().min(1).max(1000)
  })).min(1).max(12),
  risks: z.array(z.string().min(1).max(500)).max(10),
  verification: z.array(z.string().min(1).max(500)).min(1).max(10)
})

export type LearningDraft = z.infer<typeof learningDraftSchema>
export type ProposalDraft = z.infer<typeof proposalDraftSchema>
