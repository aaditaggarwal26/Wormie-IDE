import { z } from 'zod'

export const classroomUpdateSchema = z.object({
  classroomId: z.uuid(),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000)
}).strict()
