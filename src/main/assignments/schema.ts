import path from 'node:path'
import { z } from 'zod'

export const portableWorkspacePathSchema = z.string().trim().min(1).max(500).superRefine((value, context) => {
  if (
    value.includes('\\') ||
    path.posix.isAbsolute(value) ||
    path.win32.isAbsolute(value) ||
    /^[a-z]:/i.test(value) ||
    value.includes('\0')
  ) {
    context.addIssue({ code: 'custom', message: 'Task paths must be portable workspace-relative paths.' })
    return
  }

  const segments = value.split('/')
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    context.addIssue({ code: 'custom', message: 'Task paths cannot contain empty, current, or parent segments.' })
    return
  }

  if (segments.some((segment) => Buffer.byteLength(segment, 'utf8') > 240)) {
    context.addIssue({ code: 'custom', message: 'Task path segments cannot exceed 240 UTF-8 bytes.' })
    return
  }

  const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
  if (segments.some((segment) => /[<>:"|?*\x00-\x1f]/.test(segment) || /[ .]$/.test(segment) || reservedWindowsName.test(segment))) {
    context.addIssue({ code: 'custom', message: 'Task paths must use portable file and directory names.' })
    return
  }

  const protectedSegments = new Set(['.git', '.wormie', 'node_modules'])
  if (segments.some((segment) => protectedSegments.has(segment.toLowerCase()))) {
    context.addIssue({ code: 'custom', message: 'Task paths cannot reference protected workspace directories.' })
  }
})

const assignmentTaskSchema = z.object({
  id: z.string().trim().min(1).max(100).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().min(1).max(4_000),
  filePath: portableWorkspacePathSchema,
  kind: z.enum(['implement', 'fix', 'create', 'explain']),
  acceptanceCriteria: z.array(z.string().trim().min(1).max(500)).min(1).max(20)
}).strict()

const assignmentBodySchema = z.object({
  title: z.string().trim().min(1).max(120),
  summary: z.string().trim().min(1).max(500),
  instructions: z.string().trim().min(1).max(10_000),
  tasks: z.array(assignmentTaskSchema).min(1).max(50),
  aiPolicy: z.discriminatedUnion('mode', [
    z.object({
      mode: z.literal('learning-gated'),
      passingScore: z.number().int().min(60).max(100),
      allowGeneration: z.boolean()
    }).strict(),
    z.object({
      mode: z.literal('disabled'),
      passingScore: z.number().int().min(60).max(100),
      allowGeneration: z.literal(false)
    }).strict()
  ]),
  evidencePolicy: z.object({
    includeAiActivity: z.boolean(),
    includeFileSnapshots: z.boolean()
  }).strict()
}).superRefine((assignment, context) => {
  const taskIds = new Set<string>()
  for (const [index, task] of assignment.tasks.entries()) {
    if (taskIds.has(task.id)) {
      context.addIssue({ code: 'custom', path: ['tasks', index, 'id'], message: 'Task IDs must be unique.' })
    }
    taskIds.add(task.id)
  }
}).strict()

export const assignmentManifestDraftSchema = assignmentBodySchema.extend({
  id: z.uuid().optional()
})

export const assignmentManifestSchema = assignmentBodySchema.extend({
  schemaVersion: z.literal(1),
  id: z.uuid(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
})
