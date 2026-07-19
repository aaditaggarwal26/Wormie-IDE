import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { z } from 'zod'
import { IPC_CHANNELS } from '../../shared/contracts'
import type { MasteryService } from './service'

const conceptIdSchema = z.string().min(1).max(100).regex(/^[a-z0-9._-]+$/i)
export const evidencePageRequestSchema = z.object({ conceptId: conceptIdSchema.optional(), page: z.number().int().min(1).max(1_000_000), pageSize: z.number().int().min(1).max(100) }).strict()
export const goalInputSchema = z.object({
  id: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/), title: z.string().trim().min(1).max(120),
  type: z.enum(['mastery', 'reviews', 'streak', 'xp']), target: z.number().int().min(1).max(1_000_000),
  conceptId: conceptIdSchema.optional(),
  domain: z.enum(['javascript', 'typescript', 'react', 'node', 'electron', 'express', 'nextjs', 'sql', 'nosql', 'authentication', 'algorithms', 'data-structures', 'networking', 'concurrency', 'testing', 'git', 'docker', 'system-design', 'electron-apis', 'ipc', 'filesystems', 'security', 'memory-management', 'custom']).optional()
}).strict()
const preferencesSchema = z.object({
  teachingStyle: z.enum(['balanced', 'visual', 'socratic', 'example-driven']).optional(),
  lessonVerbosity: z.enum(['concise', 'standard', 'detailed']).optional(),
  exampleStyle: z.enum(['practical', 'minimal', 'analogy', 'mixed']).optional(),
  quizDifficulty: z.enum(['adaptive', 'gentle', 'challenging']).optional(),
  reviewTolerance: z.enum(['low', 'balanced', 'high']).optional(), inferenceEnabled: z.boolean().optional()
}).strict()
const reviewSubmissionSchema = z.object({ sessionId: z.uuid(), answers: z.record(z.string().max(200), z.number().int().min(0).max(10)) }).strict()
const goalUpdateSchema = z.object({ id: z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/), update: z.object({ title: z.string().trim().min(1).max(120).optional(), target: z.number().int().min(1).max(1_000_000).optional(), status: z.enum(['active', 'completed', 'archived']).optional() }).strict() }).strict()

type TrustPredicate = (event: IpcMainInvokeEvent) => boolean

export function createMasteryHandlers(service: MasteryService, isTrustedSender: TrustPredicate) {
  const trusted = (event: IpcMainInvokeEvent) => { if (!isTrustedSender(event)) throw new Error('Mastery access was denied for this window.') }
  return {
    overview: async (event: IpcMainInvokeEvent) => { trusted(event); return service.getOverview() },
    domains: async (event: IpcMainInvokeEvent) => { trusted(event); return service.getDomainSummaries() },
    concept: async (event: IpcMainInvokeEvent, raw: string) => { trusted(event); return service.getConceptDetail(conceptIdSchema.parse(raw)) },
    evidence: async (event: IpcMainInvokeEvent, raw: unknown) => { trusted(event); return service.getEvidencePage(evidencePageRequestSchema.parse(raw)) },
    misconceptions: async (event: IpcMainInvokeEvent, raw?: unknown) => { trusted(event); const status = z.enum(['active', 'remediated', 'resolved']).optional().parse(raw); return service.getMisconceptions(status) },
    reviews: async (event: IpcMainInvokeEvent) => { trusted(event); return service.getReviews() },
    startReview: async (event: IpcMainInvokeEvent, raw: string) => { trusted(event); return service.startReview(conceptIdSchema.parse(raw)) },
    submitReview: async (event: IpcMainInvokeEvent, raw: unknown) => { trusted(event); return service.submitReview(reviewSubmissionSchema.parse(raw)) },
    getPersonalization: async (event: IpcMainInvokeEvent) => { trusted(event); return service.getPersonalization() },
    savePersonalization: async (event: IpcMainInvokeEvent, raw: unknown) => { trusted(event); return service.savePersonalization(preferencesSchema.parse(raw)) },
    resetPersonalization: async (event: IpcMainInvokeEvent) => { trusted(event); return service.resetPersonalization() },
    getGoals: async (event: IpcMainInvokeEvent) => { trusted(event); return service.getGoals() },
    createGoal: async (event: IpcMainInvokeEvent, raw: unknown) => { trusted(event); return service.createGoal(goalInputSchema.parse(raw)) },
    updateGoal: async (event: IpcMainInvokeEvent, raw: unknown) => { trusted(event); const value = goalUpdateSchema.parse(raw); return service.updateGoal(value.id, value.update) },
    deleteGoal: async (event: IpcMainInvokeEvent, raw: string) => { trusted(event); service.deleteGoal(z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/).parse(raw)) },
    gamification: async (event: IpcMainInvokeEvent) => { trusted(event); return service.getGamification() },
    syncStatus: async (event: IpcMainInvokeEvent) => { trusted(event); return service.getSyncStatus() }
  }
}

export function registerMasteryIpc(service: MasteryService, isTrustedSender: TrustPredicate): void {
  const handlers = createMasteryHandlers(service, isTrustedSender)
  ipcMain.handle(IPC_CHANNELS.masteryOverview, handlers.overview)
  ipcMain.handle(IPC_CHANNELS.masteryDomains, handlers.domains)
  ipcMain.handle(IPC_CHANNELS.masteryConcept, handlers.concept)
  ipcMain.handle(IPC_CHANNELS.masteryEvidence, handlers.evidence)
  ipcMain.handle(IPC_CHANNELS.masteryMisconceptions, handlers.misconceptions)
  ipcMain.handle(IPC_CHANNELS.masteryReviews, handlers.reviews)
  ipcMain.handle(IPC_CHANNELS.masteryStartReview, handlers.startReview)
  ipcMain.handle(IPC_CHANNELS.masterySubmitReview, handlers.submitReview)
  ipcMain.handle(IPC_CHANNELS.masteryGetPersonalization, handlers.getPersonalization)
  ipcMain.handle(IPC_CHANNELS.masterySavePersonalization, handlers.savePersonalization)
  ipcMain.handle(IPC_CHANNELS.masteryResetPersonalization, handlers.resetPersonalization)
  ipcMain.handle(IPC_CHANNELS.masteryGetGoals, handlers.getGoals)
  ipcMain.handle(IPC_CHANNELS.masteryCreateGoal, handlers.createGoal)
  ipcMain.handle(IPC_CHANNELS.masteryUpdateGoal, handlers.updateGoal)
  ipcMain.handle(IPC_CHANNELS.masteryDeleteGoal, handlers.deleteGoal)
  ipcMain.handle(IPC_CHANNELS.masteryGamification, handlers.gamification)
  ipcMain.handle(IPC_CHANNELS.masterySyncStatus, handlers.syncStatus)
}
