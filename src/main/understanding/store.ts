import type {
  KnowledgeMastery,
  PrivateQuizQuestion,
  UnderstandingAnswer,
  UnderstandingGateStatus,
  UnderstandingHistoryEntry,
  UnderstandingQuiz,
  UnderstandingResult,
  UnderstandingSettings
} from '../../shared/contracts'
import { defaultUnderstandingSettings } from './significance'

export const understandingSchemaVersion = 2

export type StoredGate = {
  quiz: UnderstandingQuiz
  privateQuestions: PrivateQuizQuestion[]
  draftAnswers: Record<string, UnderstandingAnswer>
  state: UnderstandingGateStatus['state']
  lastResult: UnderstandingResult | null
  attempt: number
  startedAt: string
  updatedAt: string
}

export type UnderstandingState = {
  schemaVersion: number
  settings: UnderstandingSettings
  gates: Record<string, StoredGate>
  history: UnderstandingHistoryEntry[]
  mastery: Record<string, KnowledgeMastery>
  classroomHistory: Record<string, UnderstandingHistoryEntry[]>
  classroomMastery: Record<string, Record<string, KnowledgeMastery>>
  auditEvents: Array<{
    type: 'quiz_triggered' | 'quiz_started' | 'quiz_passed' | 'quiz_failed' | 'gate_bypassed' | 'change_rejected'
    at: string
    source: string
    significance?: string
    reasonCount?: number
  }>
}

type KeyValueStorage = {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

export function createEmptyUnderstandingState(): UnderstandingState {
  return {
    schemaVersion: understandingSchemaVersion,
    settings: { ...defaultUnderstandingSettings },
    gates: {},
    history: [],
    mastery: {},
    classroomHistory: {},
    classroomMastery: {},
    auditEvents: []
  }
}

function boundedInteger(value: unknown, fallback: number, minimum: number, maximum: number): number {
  return typeof value === 'number' && Number.isFinite(value)
    ? Math.max(minimum, Math.min(maximum, Math.round(value)))
    : fallback
}

function normalizeSettings(value: unknown): UnderstandingSettings {
  const candidate = value && typeof value === 'object' ? value as Partial<UnderstandingSettings> : {}
  const maximumQuestions = boundedInteger(candidate.maximumQuestions, defaultUnderstandingSettings.maximumQuestions, 3, 8)
  const minimumQuestions = Math.min(maximumQuestions, boundedInteger(candidate.minimumQuestions, defaultUnderstandingSettings.minimumQuestions, 2, 8))
  return {
    enabled: typeof candidate.enabled === 'boolean' ? candidate.enabled : defaultUnderstandingSettings.enabled,
    triggerLevel: candidate.triggerLevel === 'minor' ? 'minor' : 'major',
    passingScore: boundedInteger(candidate.passingScore, defaultUnderstandingSettings.passingScore, 60, 100),
    minimumQuestions,
    maximumQuestions,
    allowRetryBeforeRemediation: typeof candidate.allowRetryBeforeRemediation === 'boolean' ? candidate.allowRetryBeforeRemediation : true,
    requireBeforeAiApply: typeof candidate.requireBeforeAiApply === 'boolean' ? candidate.requireBeforeAiApply : true,
    requireBeforeCommit: typeof candidate.requireBeforeCommit === 'boolean' ? candidate.requireBeforeCommit : true,
    strictMode: typeof candidate.strictMode === 'boolean' ? candidate.strictMode : false,
    developerBypass: typeof candidate.developerBypass === 'boolean' ? candidate.developerBypass : false,
    bypassRequiresReason: typeof candidate.bypassRequiresReason === 'boolean' ? candidate.bypassRequiresReason : true
  }
}

export function migrateUnderstandingState(value: unknown): UnderstandingState {
  if (!value || typeof value !== 'object') return createEmptyUnderstandingState()
  const candidate = value as Partial<UnderstandingState>
  return {
    schemaVersion: understandingSchemaVersion,
    settings: normalizeSettings(candidate.settings),
    gates: candidate.gates && typeof candidate.gates === 'object' ? candidate.gates : {},
    history: Array.isArray(candidate.history) ? candidate.history.slice(0, 500) : [],
    mastery: candidate.mastery && typeof candidate.mastery === 'object' ? candidate.mastery : {},
    classroomHistory: candidate.classroomHistory && typeof candidate.classroomHistory === 'object' ? candidate.classroomHistory : {},
    classroomMastery: candidate.classroomMastery && typeof candidate.classroomMastery === 'object' ? candidate.classroomMastery : {},
    auditEvents: Array.isArray(candidate.auditEvents) ? candidate.auditEvents.slice(-1000) : []
  }
}

export class UnderstandingRepository {
  private readonly key = 'state'
  private state: UnderstandingState

  constructor(private readonly storage: KeyValueStorage) {
    this.state = migrateUnderstandingState(storage.get(this.key))
    this.persist()
  }

  read(): UnderstandingState {
    return structuredClone(this.state)
  }

  update(mutator: (state: UnderstandingState) => UnderstandingState): UnderstandingState {
    this.state = migrateUnderstandingState(mutator(this.read()))
    this.persist()
    return this.read()
  }

  setSettings(settings: UnderstandingSettings): UnderstandingSettings {
    this.state = { ...this.state, settings: normalizeSettings(settings) }
    this.persist()
    return { ...this.state.settings }
  }

  private persist(): void {
    this.storage.set(this.key, this.state)
  }
}
