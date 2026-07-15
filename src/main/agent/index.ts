import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, type MessageBoxOptions, type WebContents } from 'electron'
import type Store from 'electron-store'
import {
  IPC_CHANNELS,
  type AgentConfig,
  type AgentActivityEvent,
  type AgentActivityFile,
  type AgentActivityPhase,
  type AgentConfigUpdate,
  type AppliedProposal,
  type CodeProposal,
  type ChangeInput,
  type LearningRequest,
  type LearningSession,
  type ProposedFileChange,
  type QuizResult,
  type QuizSubmission
} from '../../shared/contracts'
import { isPathInside, validateEntryName } from '../pathSafety'
import { readAssignment } from '../assignments/storage'
import { appendAiActivity, type AssignmentAiActivityInput } from '../assignments/activity'
import type { AppPreferences } from '../preferences'
import { createWorkspaceSnapshot } from '../workspace'
import { buildWorkspaceContext } from './context'
import { CodexAppServer } from './codexAppServer'
import { sanitizeAgentActivity } from './activity'
import { gradeQuiz, type AnswerKey } from './grading'
import { ModelGateway, validateBaseUrl } from './provider'
import { changeConceptDraftSchema, learningDraftSchema, proposalDraftSchema, remediationDraftSchema, semanticGradeSchema, understandingQuizDraftSchema } from './schemas'
import type { UnderstandingController } from '../understanding'

type InternalSession = {
  publicSession: LearningSession
  answerKey: AnswerKey
  contextRequest: LearningRequest
  workspaceRoot: string
  assignmentId: string | null
  assignmentRevision: string | null
  allowGeneration: boolean
  passed: boolean
  attempts: number
  createdAt: number
}

type InternalChange = ProposedFileChange & {
  absolutePath: string
  expectedHash: string | null
  beforeContent: string | null
}

type InternalProposal = {
  publicProposal: CodeProposal
  changes: InternalChange[]
  workspaceRoot: string
  createdAt: number
  changeInput: ChangeInput
}

const defaultConfig = {
  provider: 'openai-compatible' as const,
  model: 'gpt-5.4-mini',
  baseUrl: 'https://api.openai.com/v1'
}
const sessionTtlMs = 30 * 60 * 1000
const maxRequestLength = 4_000

function hash(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function cleanError(error: unknown, secret?: string | null): Error {
  const fallback = 'The AI request failed. Check the provider, model, key, and network connection.'
  if (!(error instanceof Error)) return new Error(fallback)
  if (error.name === 'AbortError') return new Error('The AI request was cancelled.')
  let message = error.message.replace(/(?:sk|key)-[A-Za-z0-9_-]{8,}/g, '[redacted]')
  if (secret) message = message.split(secret).join('[redacted]')
  return new Error(message.length <= 500 ? message : fallback)
}

function validateModel(model: string, provider: AgentConfig['provider']): string {
  const trimmed = typeof model === 'string' ? model.trim() : ''
  if (provider === 'openai-compatible' && !trimmed) throw new Error('Enter a model ID.')
  if (trimmed.length > 200 || /[\r\n\0]/.test(trimmed)) throw new Error('Enter a valid model ID.')
  return trimmed
}

function validateRelativeChangePath(rootPath: string, relativePath: string): string {
  if (
    typeof relativePath !== 'string' ||
    path.isAbsolute(relativePath) ||
    path.win32.isAbsolute(relativePath) ||
    path.posix.isAbsolute(relativePath) ||
    relativePath.includes('\0')
  ) {
    throw new Error('The model proposed an invalid file path.')
  }
  const rawSegments = relativePath.split(/[\\/]/)
  if (rawSegments.some((segment) => !segment)) throw new Error('The model proposed an invalid file path.')
  rawSegments.forEach(validateEntryName)
  const normalized = path.join(...rawSegments)
  const absolutePath = path.resolve(rootPath, normalized)
  if (!normalized || normalized === '.' || !isPathInside(rootPath, absolutePath)) {
    throw new Error('The model proposed a file outside the workspace.')
  }
  const segments = normalized.split(path.sep).map((segment) => segment.toLowerCase())
  const outputName = path.basename(normalized).toLowerCase()
  const protectedNames = ['.env', '.npmrc', '.pypirc', 'auth.json', 'credentials', 'credentials.json', 'secrets.json']
  const protectedExtensions = ['.key', '.pem', '.p12', '.pfx', '.keystore']
  if (
    segments.some((segment) => ['.git', 'node_modules'].includes(segment)) ||
    protectedNames.includes(outputName) ||
    outputName.startsWith('.env.') ||
    protectedExtensions.includes(path.extname(outputName)) ||
    /(?:^|[._-])(secret|credential|private-key)/i.test(outputName)
  ) {
    throw new Error(`The model proposed a protected path: ${relativePath}`)
  }
  return absolutePath
}

export function registerAgentHandlers(
  store: Store<AppPreferences>,
  getWorkspaceRoot: () => string | null,
  understanding: UnderstandingController,
  progressStorageRoot: string
): void {
  const sessions = new Map<string, InternalSession>()
  const proposals = new Map<string, InternalProposal>()
  let sessionApiKey: string | null = null
  let activeController: AbortController | null = null
  let activeActivity: { sender: WebContents; runId: string } | null = null
  const codexRuntime = new CodexAppServer(path.join(app.getPath('userData'), 'codex'))

  app.once('before-quit', () => codexRuntime.stop())

  function pruneExpired(): void {
    const cutoff = Date.now() - sessionTtlMs
    for (const [id, session] of sessions) if (session.createdAt < cutoff) sessions.delete(id)
    for (const [id, proposal] of proposals) if (proposal.createdAt < cutoff) proposals.delete(id)
  }

  function readApiKey(): { value: string | null; storage: AgentConfig['keyStorage'] } {
    if (sessionApiKey) return { value: sessionApiKey, storage: 'session' }
    const encrypted = store.get('agent')?.encryptedApiKey
    if (!encrypted || !safeStorage.isEncryptionAvailable()) return { value: null, storage: 'none' }
    try {
      return { value: safeStorage.decryptString(Buffer.from(encrypted, 'base64')), storage: 'encrypted' }
    } catch {
      return { value: null, storage: 'none' }
    }
  }

  function getConfig(): AgentConfig {
    const saved = store.get('agent')
    const key = readApiKey()
    return {
      provider: saved?.provider ?? defaultConfig.provider,
      model: saved?.model ?? defaultConfig.model,
      baseUrl: saved?.baseUrl ?? defaultConfig.baseUrl,
      hasApiKey: Boolean(key.value),
      keyStorage: key.storage,
      passingScore: store.get('learningPassingScore') ?? 80
    }
  }

  async function currentAssignmentPolicy(rootPath: string): Promise<{
    assignmentId: string | null
    assignmentRevision: string | null
    passingScore: number
    allowGeneration: boolean
  }> {
    const state = await readAssignment(rootPath)
    if (!state.manifest) {
      return {
        assignmentId: null,
        assignmentRevision: null,
        passingScore: store.get('learningPassingScore') ?? 80,
        allowGeneration: true
      }
    }
    if (state.manifest.aiPolicy.mode === 'disabled') throw new Error('The teacher disabled AI for this assignment.')
    return {
      assignmentId: state.manifest.id,
      assignmentRevision: state.revision,
      passingScore: state.manifest.aiPolicy.passingScore,
      allowGeneration: state.manifest.aiPolicy.allowGeneration
    }
  }

  async function assertSessionPolicy(session: InternalSession, rootPath: string, requireGeneration: boolean): Promise<void> {
    const policy = await currentAssignmentPolicy(rootPath)
    if (policy.assignmentId !== session.assignmentId || policy.assignmentRevision !== session.assignmentRevision) {
      throw new Error('The assignment policy changed after this learning session started. Start a new request.')
    }
    if (requireGeneration && (!session.allowGeneration || !policy.allowGeneration)) {
      throw new Error('This assignment allows AI tutoring but does not allow AI-generated code.')
    }
  }

  async function recordAssignmentActivity(rootPath: string, input: AssignmentAiActivityInput): Promise<void> {
    const assignment = await readAssignment(rootPath)
    if (!assignment.manifest || !assignment.revision) return
    await appendAiActivity(progressStorageRoot, rootPath, assignment.manifest, assignment.revision, input)
  }

  function validateRunId(value: unknown): string {
    if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(value)) throw new Error('Invalid agent activity run.')
    return value
  }

  function emitActivity(
    sender: WebContents,
    runId: string,
    input: Omit<AgentActivityEvent, 'id' | 'runId' | 'timestamp'>
  ): void {
    if (sender.isDestroyed()) return
    const activity = sanitizeAgentActivity({
      ...input,
      id: randomUUID(),
      runId,
      timestamp: new Date().toISOString()
    })
    sender.send(IPC_CHANNELS.agentActivity, activity)
  }

  function emitPhase(
    sender: WebContents,
    runId: string,
    phase: AgentActivityPhase,
    label: string,
    state: AgentActivityEvent['state'],
    detail?: string
  ): void {
    emitActivity(sender, runId, { kind: 'phase', phase, label, state, ...(detail ? { detail } : {}) })
  }

  function emitFiles(sender: WebContents, runId: string, phase: 'proposal' | 'apply', label: string, files: AgentActivityFile[]): void {
    emitActivity(sender, runId, { kind: 'files', phase, label, state: 'completed', files })
  }

  async function runModel<T>(
    operation: (
      gateway: ModelGateway,
      signal: AbortSignal,
      onProtocolEvent?: (method: string, detail: string) => void
    ) => Promise<T>,
    activity?: { sender: WebContents; runId: string }
  ): Promise<T> {
    if (activeController) throw new Error('Another AI request is already running.')
    const controller = new AbortController()
    activeController = controller
    activeActivity = activity ?? null
    const timeout = setTimeout(() => controller.abort(), 120_000)
    const key = readApiKey()
    try {
      const onProtocolEvent = activity
        ? (method: string, detail: string) => emitActivity(activity.sender, activity.runId, {
            kind: 'protocol',
            phase: 'model',
            label: 'Codex runtime event',
            state: method === 'turn/completed' ? 'completed' : 'active',
            protocolMethod: method,
            detail
          })
        : undefined
      return await operation(new ModelGateway(getConfig(), key.value, codexRuntime), controller.signal, onProtocolEvent)
    } catch (error) {
      const cleaned = cleanError(error, key.value)
      if (activity) emitPhase(
        activity.sender,
        activity.runId,
        'model',
        cleaned.message === 'The AI request was cancelled.' ? 'AI request stopped' : 'AI request failed',
        cleaned.message === 'The AI request was cancelled.' ? 'stopped' : 'failed',
        cleaned.message
      )
      throw cleaned
    } finally {
      clearTimeout(timeout)
      if (activeController === controller) activeController = null
      if (activeActivity?.runId === activity?.runId) activeActivity = null
    }
  }

  understanding.setAi({
    extractConcepts: (prompt) => runModel((gateway, signal) => gateway.generateStructured('change-concepts', prompt, changeConceptDraftSchema, signal)),
    generateQuiz: (prompt) => runModel((gateway, signal) => gateway.generateStructured('understanding-quiz', prompt, understandingQuizDraftSchema, signal)),
    gradeAnswer: (prompt) => runModel((gateway, signal) => gateway.generateStructured('semantic-grade', prompt, semanticGradeSchema, signal)),
    generateRemediation: (prompt) => runModel((gateway, signal) => gateway.generateStructured('remediation', prompt, remediationDraftSchema, signal)),
    modelIdentifier: () => getConfig().model || 'codex-default'
  })

  ipcMain.handle(IPC_CHANNELS.agentGetConfig, getConfig)

  ipcMain.handle(IPC_CHANNELS.agentGetCodexAccount, () => codexRuntime.getAccountStatus())

  ipcMain.handle(IPC_CHANNELS.agentConnectCodexAccount, () => codexRuntime.connectChatGpt((url) => shell.openExternal(url)))

  ipcMain.handle(IPC_CHANNELS.agentSetPassingScore, (_event, rawScore: number): number => {
    if (!Number.isInteger(rawScore) || rawScore < 60 || rawScore > 100) throw new Error('Passing score must be between 60 and 100.')
    store.set('learningPassingScore', rawScore)
    return rawScore
  })

  ipcMain.handle(IPC_CHANNELS.agentSaveConfig, (_event, update: AgentConfigUpdate): AgentConfig => {
    if (!update || !['openai-compatible', 'codex-account'].includes(update.provider)) {
      throw new Error('Choose a supported AI provider.')
    }
    const current = store.get('agent')
    const nextBaseUrl = update.provider === 'openai-compatible'
      ? validateBaseUrl(update.baseUrl)
      : current?.baseUrl ?? defaultConfig.baseUrl
    const connectionChanged = Boolean(current) && current?.baseUrl !== nextBaseUrl
    const next = {
      provider: update.provider,
      model: validateModel(update.model, update.provider),
      baseUrl: nextBaseUrl,
      encryptedApiKey: connectionChanged ? undefined : current?.encryptedApiKey
    }

    if (connectionChanged) sessionApiKey = null

    if (update.clearApiKey) {
      next.encryptedApiKey = undefined
      sessionApiKey = null
    }
    if (typeof update.apiKey === 'string' && update.apiKey.trim()) {
      const apiKey = update.apiKey.trim()
      if (apiKey.length > 4096 || /[\r\n\0]/.test(apiKey)) throw new Error('Enter a valid API key.')
      if (safeStorage.isEncryptionAvailable()) {
        next.encryptedApiKey = safeStorage.encryptString(apiKey).toString('base64')
        sessionApiKey = null
      } else {
        next.encryptedApiKey = undefined
        sessionApiKey = apiKey
      }
    }
    store.set('agent', next)
    return getConfig()
  })

  ipcMain.handle(IPC_CHANNELS.agentStartLearning, async (event, request: LearningRequest): Promise<LearningSession> => {
    pruneExpired()
    const runId = validateRunId(request?.runId)
    const rootPath = getWorkspaceRoot()
    if (!rootPath) throw new Error('Open a workspace before asking the tutor for a code change.')
    const intent = typeof request?.request === 'string' ? request.request.trim() : ''
    if (!intent || intent.length > maxRequestLength) throw new Error('Describe the change in 1 to 4,000 characters.')
    const assignmentPolicy = await currentAssignmentPolicy(rootPath)
    const passingScore = assignmentPolicy.passingScore
    const contextRequest: LearningRequest = {
      runId,
      request: intent,
      activePath: typeof request.activePath === 'string' ? request.activePath : null,
      openPaths: Array.isArray(request.openPaths)
        ? request.openPaths.filter((filePath): filePath is string => typeof filePath === 'string').slice(0, 6)
        : []
    }
    emitPhase(event.sender, runId, 'context', 'Gathering workspace context', 'active')
    const context = await buildWorkspaceContext(rootPath, contextRequest)
    emitPhase(event.sender, runId, 'context', 'Workspace context ready', 'completed', `${contextRequest.openPaths?.length ?? 0} open files considered`)
    emitPhase(event.sender, runId, 'learning', 'Preparing the learning plan', 'active')
    const draft = await runModel((gateway, signal, onProtocolEvent) => gateway.generateStructured(
      'learning',
      `Analyze this requested change and teach only the prerequisite concepts. Do not provide implementation code yet.
Create 2-5 concise concept lessons and 3-5 multiple-choice questions that test applied understanding, not trivia.

<user-request>\n${intent}\n</user-request>\n\n${context}`,
      learningDraftSchema,
      signal,
      onProtocolEvent
    ), { sender: event.sender, runId })
    emitPhase(event.sender, runId, 'validation', 'Structured learning plan validated', 'completed')

    const sessionId = randomUUID()
    const quiz = draft.quiz.map((question, index) => ({
      id: `${sessionId}:${index}`,
      prompt: question.prompt,
      options: question.options
    }))
    const publicSession: LearningSession = {
      id: sessionId,
      runId,
      request: intent,
      concepts: draft.concepts,
      lessonSummary: draft.lessonSummary,
      quiz,
      passingScore
    }
    const internalSession: InternalSession = {
      publicSession,
      answerKey: draft.quiz.map((question, index) => ({
        questionId: quiz[index].id,
        correctOption: question.correctOption,
        explanation: question.explanation
      })),
      contextRequest,
      workspaceRoot: rootPath,
      assignmentId: assignmentPolicy.assignmentId,
      assignmentRevision: assignmentPolicy.assignmentRevision,
      allowGeneration: assignmentPolicy.allowGeneration,
      passed: false,
      attempts: 0,
      createdAt: Date.now()
    }
    await recordAssignmentActivity(rootPath, {
      type: 'learning',
      request: intent,
      concepts: draft.concepts.map((concept) => concept.name),
      lessonSummary: draft.lessonSummary
    })
    sessions.set(sessionId, internalSession)
    emitPhase(event.sender, runId, 'learning', 'Learning plan ready', 'completed', `${draft.concepts.length} concepts prepared`)
    emitPhase(event.sender, runId, 'quiz', 'Waiting for your learning check', 'active')
    return publicSession
  })

  ipcMain.handle(IPC_CHANNELS.agentSubmitQuiz, async (event, submission: QuizSubmission): Promise<QuizResult> => {
    pruneExpired()
    const session = sessions.get(submission?.sessionId)
    if (!session) throw new Error('This learning session expired. Start the request again.')
    if (session.attempts >= 3 && !session.passed) throw new Error('This quiz reached its attempt limit. Start a new learning session for fresh questions.')
    session.attempts += 1
    const result = gradeQuiz(submission, session.answerKey, session.publicSession.passingScore)
    session.passed = result.passed
    await recordAssignmentActivity(session.workspaceRoot, { type: 'quiz', sessionId: session.publicSession.id, score: result.score, passed: result.passed })
    emitPhase(
      event.sender,
      session.publicSession.runId,
      'quiz',
      result.passed ? 'Learning check passed' : 'Learning check needs another attempt',
      result.passed ? 'completed' : 'active',
      `${result.score}% score`
    )
    return result
  })

  ipcMain.handle(IPC_CHANNELS.agentGenerateProposal, async (event, sessionId: string): Promise<CodeProposal> => {
    pruneExpired()
    const session = sessions.get(sessionId)
    if (!session) throw new Error('This learning session expired. Start the request again.')
    if (!session.passed) throw new Error('Pass the learning check before generating code.')
    const rootPath = getWorkspaceRoot()
    if (!rootPath) throw new Error('Open a workspace first.')
    if (rootPath !== session.workspaceRoot) throw new Error('Return to the workspace where this learning session started.')
    await assertSessionPolicy(session, rootPath, true)
    const runId = session.publicSession.runId
    emitPhase(event.sender, runId, 'proposal', 'Preparing proposed files', 'active')
    const currentContext = await buildWorkspaceContext(rootPath, session.contextRequest)

    const draft = await runModel((gateway, signal, onProtocolEvent) => gateway.generateStructured(
      'proposal',
      `Create a minimal, production-quality implementation for the request below.
Return complete UTF-8 file contents for every changed file. Use only relative workspace paths.
You may create or update files, but never delete files. Do not modify secrets, .git, or node_modules.
Prefer the smallest coherent change and include concrete verification steps.

<user-request>\n${session.publicSession.request}\n</user-request>\n\n${currentContext}`,
      proposalDraftSchema,
      signal,
      onProtocolEvent
    ), { sender: event.sender, runId })
    emitPhase(event.sender, runId, 'validation', 'Validating proposed file changes', 'active')

    const internalChanges: InternalChange[] = []
    const proposedPaths = new Set<string>()
    for (const change of draft.changes) {
      const candidatePath = validateRelativeChangePath(rootPath, change.relativePath)
      let absolutePath = candidatePath
      let expectedHash: string | null = null
      let beforeContent: string | null = null
      if (change.action === 'update') {
        const resolvedPath = await fs.realpath(candidatePath).catch(() => null)
        if (!resolvedPath || !isPathInside(rootPath, resolvedPath)) throw new Error(`Cannot update missing file: ${change.relativePath}`)
        absolutePath = resolvedPath
        const existing = await fs.readFile(resolvedPath, 'utf8')
        beforeContent = existing
        expectedHash = hash(existing)
      } else {
        const parent = await fs.realpath(path.dirname(candidatePath)).catch(() => null)
        if (!parent || !isPathInside(rootPath, parent)) throw new Error(`Create files only in existing workspace folders: ${change.relativePath}`)
        absolutePath = path.join(parent, path.basename(candidatePath))
        try {
          await fs.access(absolutePath)
          throw new Error(`Cannot create a file that already exists: ${change.relativePath}`)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
      const canonicalProposalPath = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath
      if (proposedPaths.has(canonicalProposalPath)) throw new Error(`The model proposed ${change.relativePath} more than once.`)
      proposedPaths.add(canonicalProposalPath)
      internalChanges.push({ ...change, absolutePath, expectedHash, beforeContent })
    }

    const proposalId = randomUUID()
    const changeInput: ChangeInput = {
      id: proposalId,
      source: 'ai_proposal',
      title: draft.summary.slice(0, 160),
      description: draft.summary,
      files: internalChanges.map((change) => {
        const beforeLines = change.beforeContent?.split(/\r?\n/) ?? []
        const afterLines = change.content.split(/\r?\n/)
        let prefix = 0
        while (prefix < beforeLines.length && prefix < afterLines.length && beforeLines[prefix] === afterLines[prefix]) prefix += 1
        let suffix = 0
        while (suffix < beforeLines.length - prefix && suffix < afterLines.length - prefix && beforeLines[beforeLines.length - 1 - suffix] === afterLines[afterLines.length - 1 - suffix]) suffix += 1
        return {
          path: change.relativePath,
          status: change.action === 'create' ? 'added' as const : 'modified' as const,
          additions: Math.max(0, afterLines.length - prefix - suffix),
          deletions: change.action === 'create' ? 0 : Math.max(0, beforeLines.length - prefix - suffix),
          beforeContent: change.beforeContent ?? undefined,
          afterContent: change.content,
          patch: `--- before/${change.relativePath}\n${(change.beforeContent ?? '').slice(0, 18_000)}\n+++ after/${change.relativePath}\n${change.content.slice(0, 18_000)}`
        }
      })
    }
    const publicProposal: CodeProposal = {
      id: proposalId,
      sessionId,
      summary: draft.summary,
      changes: draft.changes,
      risks: draft.risks,
      verification: draft.verification
    }
    await recordAssignmentActivity(rootPath, {
      type: 'proposal',
      sessionId,
      proposalId,
      summary: draft.summary,
      paths: draft.changes.map((change) => change.relativePath)
    })
    proposals.set(proposalId, { publicProposal, changes: internalChanges, workspaceRoot: rootPath, createdAt: Date.now(), changeInput })
    try {
      publicProposal.understanding = await understanding.prepare(changeInput)
    } catch (error) {
      const analysis = understanding.analyze(changeInput)
      publicProposal.understanding = {
        changeId: changeInput.id,
        ...analysis,
        gate: null,
        generationError: cleanError(error).message
      }
    }
    emitPhase(event.sender, runId, 'validation', 'Proposal validated', 'completed')
    emitPhase(event.sender, runId, 'proposal', 'Proposal ready for review', 'completed', `${draft.changes.length} file${draft.changes.length === 1 ? '' : 's'} proposed`)
    emitFiles(event.sender, runId, 'proposal', 'Proposed files', draft.changes.map((change) => ({ path: change.relativePath, action: change.action })))
    emitPhase(event.sender, runId, 'approval', 'Waiting for your proposal review', 'active')
    return publicProposal
  })

  ipcMain.handle(IPC_CHANNELS.agentPrepareProposalQuiz, async (_event, proposalId: string) => {
    pruneExpired()
    if (typeof proposalId !== 'string' || proposalId.length > 200) throw new Error('Invalid proposal ID.')
    const proposal = proposals.get(proposalId)
    if (!proposal) throw new Error('This proposal expired. Generate a fresh proposal.')
    const prepared = await understanding.prepare(proposal.changeInput, true)
    proposal.publicProposal.understanding = prepared
    return prepared
  })

  ipcMain.handle(IPC_CHANNELS.agentRejectProposal, (_event, proposalId: string): void => {
    if (typeof proposalId !== 'string' || proposalId.length > 200) throw new Error('Invalid proposal ID.')
    const proposal = proposals.get(proposalId)
    if (!proposal) return
    understanding.gates.recordRejected(proposal.changeInput, understanding.analyze(proposal.changeInput).significance)
    proposals.delete(proposalId)
  })

  ipcMain.handle(IPC_CHANNELS.agentApplyProposal, async (event, proposalId: string): Promise<AppliedProposal> => {
    pruneExpired()
    const proposal = proposals.get(proposalId)
    if (!proposal) throw new Error('This proposal expired or was already applied.')
    const session = sessions.get(proposal.publicProposal.sessionId)
    if (!session?.passed) throw new Error('The learning gate is no longer unlocked.')
    const runId = session.publicSession.runId
    const rootPath = getWorkspaceRoot()
    if (!rootPath) throw new Error('Open a workspace first.')
    if (rootPath !== proposal.workspaceRoot) throw new Error('Return to the workspace where this proposal was generated.')
    await assertSessionPolicy(session, rootPath, true)
    const analysis = understanding.analyze(proposal.changeInput)
    if (analysis.significance.quizRequired) {
      understanding.gates.assertUnlocked(proposal.changeInput.id, proposal.changeInput.source, analysis.fingerprint)
    }

    for (const change of proposal.changes) {
      if (change.action === 'update') {
        const current = await fs.readFile(change.absolutePath, 'utf8')
        if (hash(current) !== change.expectedHash) {
          throw new Error(`${change.relativePath} changed after generation. Generate a fresh proposal to avoid overwriting work.`)
        }
      } else {
        try {
          await fs.access(change.absolutePath)
          throw new Error(`${change.relativePath} now exists. Generate a fresh proposal to avoid overwriting it.`)
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
        }
      }
    }

    const parentWindow = BrowserWindow.fromWebContents(event.sender) ?? undefined
    const confirmationOptions: MessageBoxOptions = {
      type: 'warning',
      title: 'Apply AI proposal',
      message: `Apply ${proposal.changes.length} AI-generated file change${proposal.changes.length === 1 ? '' : 's'}?`,
      detail: proposal.changes.map((change) => `${change.action === 'create' ? 'Create' : 'Update'} ${change.relativePath}`).join('\n'),
      buttons: ['Apply changes', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      noLink: true
    }
    const confirmation = parentWindow
      ? await dialog.showMessageBox(parentWindow, confirmationOptions)
      : await dialog.showMessageBox(confirmationOptions)
    if (confirmation.response !== 0) {
      await recordAssignmentActivity(rootPath, { type: 'apply', proposalId, applied: false, paths: proposal.changes.map((change) => change.relativePath) })
      emitPhase(event.sender, runId, 'approval', 'Apply cancelled', 'stopped')
      return { applied: false, changedPaths: [], workspace: await createWorkspaceSnapshot(rootPath) }
    }

    emitPhase(event.sender, runId, 'approval', 'Apply approved', 'completed')
    emitPhase(event.sender, runId, 'apply', 'Applying approved file changes', 'active')
    const originals = new Map<string, string | null>()
    try {
      for (const change of proposal.changes) {
        originals.set(change.absolutePath, change.action === 'update' ? await fs.readFile(change.absolutePath, 'utf8') : null)
        await fs.writeFile(change.absolutePath, change.content, change.action === 'create' ? { encoding: 'utf8', flag: 'wx' } : 'utf8')
      }
      await recordAssignmentActivity(rootPath, { type: 'apply', proposalId, applied: true, paths: proposal.changes.map((change) => change.relativePath) })
    } catch (error) {
      for (const [filePath, content] of [...originals.entries()].reverse()) {
        if (content === null) await fs.unlink(filePath).catch(() => undefined)
        else await fs.writeFile(filePath, content, 'utf8').catch(() => undefined)
      }
      emitPhase(event.sender, runId, 'apply', 'File changes rolled back', 'failed', cleanError(error).message)
      throw error
    }

    proposals.delete(proposalId)
    const changedPaths = proposal.changes.map((change) => change.absolutePath)
    emitFiles(event.sender, runId, 'apply', 'Changed files', changedPaths.map((filePath) => ({ path: filePath, action: 'applied' })))
    emitPhase(event.sender, runId, 'apply', 'Approved file changes applied', 'completed', `${changedPaths.length} file${changedPaths.length === 1 ? '' : 's'} changed`)
    emitPhase(event.sender, runId, 'complete', 'Agent workflow completed', 'completed')
    return {
      applied: true,
      changedPaths,
      workspace: await createWorkspaceSnapshot(rootPath)
    }
  })

  ipcMain.on(IPC_CHANNELS.agentCancel, () => {
    if (activeActivity) emitPhase(activeActivity.sender, activeActivity.runId, 'complete', 'AI request stopped', 'stopped')
    activeController?.abort()
  })
}
