import { randomUUID } from 'node:crypto'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type {
  ChangeInput,
  ChangeSignificanceResult,
  ChangeUnderstandingPreparation,
  KnowledgeMastery,
  PrivateQuizQuestion,
  UnderstandingAnswer,
  UnderstandingQuiz
} from '../../shared/contracts'
import { IPC_CHANNELS } from '../../shared/contracts'
import type { ChangeConceptDraft, RemediationDraft, SemanticGradeDraft, UnderstandingQuizDraft } from '../agent/schemas'
import { fingerprintChange } from './fingerprint'
import { UnderstandingGateService, type ClassroomUnderstandingScope, type UnderstandingCompletion } from './gate'
import { toPublicQuestion } from './grading'
import { buildConceptExtractionPrompt, buildQuizGenerationPrompt, buildRemediationPrompt, buildSemanticGradingPrompt } from './prompts'
import { sanitizeChangeContext } from './redaction'
import { classifyChange } from './significance'
import type { UnderstandingRepository } from './store'

type UnderstandingAi = {
  extractConcepts: (prompt: string) => Promise<ChangeConceptDraft>
  generateQuiz: (prompt: string) => Promise<UnderstandingQuizDraft>
  gradeAnswer: (prompt: string) => Promise<SemanticGradeDraft>
  generateRemediation: (prompt: string) => Promise<RemediationDraft>
  modelIdentifier: () => string
}

export class UnderstandingController {
  readonly gates: UnderstandingGateService
  private ai: UnderstandingAi | null = null
  private readonly quizContexts = new Map<string, string>()

  constructor(readonly repository: UnderstandingRepository, getClassroomScope?: () => ClassroomUnderstandingScope | null) {
    this.gates = new UnderstandingGateService(
      repository,
      async (question, answer) => {
        if (!this.ai) throw new Error('AI grading is unavailable.')
        const result = await this.ai.gradeAnswer(buildSemanticGradingPrompt(question, answer, this.quizContexts.get(question.id.split(':')[0]) ?? ''))
        return { correct: result.isCorrect, explanation: result.feedback, misconception: result.misconceptions.join(' ') || undefined }
      },
      async (quiz, feedback) => {
        if (!this.ai) throw new Error('AI remediation is unavailable.')
        const result = await this.ai.generateRemediation(buildRemediationPrompt(quiz, feedback, this.quizContexts.get(quiz.id) ?? ''))
        return result.lesson
      },
      getClassroomScope
    )
  }

  setCompletionListener(listener: (completion: UnderstandingCompletion) => void): void {
    this.gates.setCompletionListener(listener)
  }

  setAi(ai: UnderstandingAi): void {
    this.ai = ai
  }

  analyze(change: ChangeInput): { fingerprint: string; significance: ChangeSignificanceResult } {
    return {
      fingerprint: fingerprintChange(change),
      significance: classifyChange(change, this.gates.getSettings())
    }
  }

  async prepare(change: ChangeInput, forceNew = false): Promise<ChangeUnderstandingPreparation> {
    const { fingerprint, significance } = this.analyze(change)
    if (!significance.quizRequired) return { changeId: change.id, fingerprint, significance, gate: null }
    const existing = this.gates.getStatus(change.id, fingerprint)
    if (existing && !forceNew) return { changeId: change.id, fingerprint, significance, gate: existing }
    if (!this.ai) throw new Error('Configure an AI provider before generating an understanding check.')

    const safeChange = sanitizeChangeContext(change)
    if (safeChange.files.length === 0) throw new Error('No safe text diff is available for a grounded understanding check.')
    const concepts = await this.ai.extractConcepts(buildConceptExtractionPrompt(safeChange, significance))
    const mastery = this.gates.getHistory().mastery as KnowledgeMastery[]
    const draft = await this.ai.generateQuiz(buildQuizGenerationPrompt(safeChange, significance, concepts, this.gates.getSettings(), mastery))
    this.validateGrounding(draft, safeChange, significance)

    const quizId = randomUUID()
    const privateQuestions: PrivateQuizQuestion[] = draft.questions.map((question, index) => ({
      ...question,
      id: `${quizId}:${index}`
    }))
    const settings = this.gates.getSettings()
    const quiz: UnderstandingQuiz = {
      id: quizId,
      changeId: change.id,
      source: change.source,
      fingerprint,
      diffFingerprint: fingerprint,
      quizVersion: 1,
      promptVersion: 'major-change-understanding-v1',
      modelIdentifier: this.ai.modelIdentifier().slice(0, 200),
      title: draft.title,
      summary: draft.summary,
      whyThisMatters: draft.whyThisMatters,
      flowSummary: draft.flowSummary,
      risks: draft.risks,
      concepts: draft.concepts,
      questions: privateQuestions.map(toPublicQuestion),
      passingScore: significance.level === 'critical' ? Math.max(90, settings.passingScore) : settings.passingScore,
      estimatedMinutes: Math.max(2, Math.ceil(privateQuestions.length * 0.75)),
      significance,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }
    this.quizContexts.set(quizId, JSON.stringify(safeChange))
    return { changeId: change.id, fingerprint, significance, gate: this.gates.createGate(change, quiz, privateQuestions) }
  }

  registerIpc(isTrustedSender: (event: IpcMainInvokeEvent) => boolean): void {
    const assertTrusted = (event: IpcMainInvokeEvent) => {
      if (!isTrustedSender(event)) throw new Error('Understanding access was denied for this window.')
    }
    ipcMain.handle(IPC_CHANNELS.understandingGetSettings, (event) => { assertTrusted(event); return this.gates.getSettings() })
    ipcMain.handle(IPC_CHANNELS.understandingSaveSettings, (event, settings) => { assertTrusted(event); return this.gates.setSettings(settings) })
    ipcMain.handle(IPC_CHANNELS.understandingGetHistory, (event) => { assertTrusted(event); return this.gates.getHistory() })
    ipcMain.handle(IPC_CHANNELS.understandingGetGate, (event, changeId: string, fingerprint?: string) => {
      assertTrusted(event)
      if (typeof changeId !== 'string' || changeId.length > 200) throw new Error('Invalid change ID.')
      return this.gates.getStatus(changeId, typeof fingerprint === 'string' ? fingerprint : undefined)
    })
    ipcMain.handle(IPC_CHANNELS.understandingSaveAnswers, (event, quizId: string, answers: Record<string, UnderstandingAnswer>) => {
      assertTrusted(event)
      if (typeof quizId !== 'string' || quizId.length > 200 || !answers || typeof answers !== 'object') throw new Error('Invalid quiz draft.')
      return this.gates.saveAnswers(quizId, answers)
    })
    ipcMain.handle(IPC_CHANNELS.understandingSubmit, (event, submission) => {
      assertTrusted(event)
      if (!submission || typeof submission.quizId !== 'string' || submission.quizId.length > 200 || !submission.answers || typeof submission.answers !== 'object') throw new Error('Invalid quiz submission.')
      return this.gates.submit(submission)
    })
    ipcMain.handle(IPC_CHANNELS.understandingBypass, (event, quizId: string, reason: string) => {
      assertTrusted(event)
      if (typeof quizId !== 'string' || quizId.length > 200 || typeof reason !== 'string' || reason.length > 500) throw new Error('Invalid bypass request.')
      return this.gates.bypass(quizId, reason)
    })
  }

  private validateGrounding(draft: UnderstandingQuizDraft, change: ChangeInput, significance: ChangeSignificanceResult): void {
    const paths = new Set(change.files.map((file) => file.path.replace(/\\/g, '/').toLowerCase()))
    const formats = new Set(draft.questions.map((question) => question.type))
    const reasoningTypes = new Set(['predict_behavior', 'spot_the_bug', 'short_answer', 'code_ordering'])
    if (formats.size < 2 || !draft.questions.some((question) => reasoningTypes.has(question.type))) {
      throw new Error('The generated quiz did not include enough applied code reasoning.')
    }
    if (draft.questions.some((question) => question.sourceReferences.some((reference) => !paths.has(reference.path.replace(/\\/g, '/').toLowerCase())))) {
      throw new Error('The generated quiz cited a file outside the supplied change.')
    }
    if (significance.level === 'critical' && !draft.questions.some((question) => question.difficulty === 'hard' && reasoningTypes.has(question.type))) {
      throw new Error('Critical changes require a hard scenario-based question.')
    }
  }
}
