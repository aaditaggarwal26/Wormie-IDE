import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell, type MessageBoxOptions } from 'electron'
import type Store from 'electron-store'
import {
  IPC_CHANNELS,
  type AgentConfig,
  type AgentConfigUpdate,
  type AppliedProposal,
  type CodeProposal,
  type LearningRequest,
  type LearningSession,
  type ProposedFileChange,
  type QuizResult,
  type QuizSubmission
} from '../../shared/contracts'
import { isPathInside, validateEntryName } from '../pathSafety'
import type { AppPreferences } from '../preferences'
import { createWorkspaceSnapshot } from '../workspace'
import { buildWorkspaceContext } from './context'
import { CodexAppServer } from './codexAppServer'
import { gradeQuiz, type AnswerKey } from './grading'
import { ModelGateway, validateBaseUrl } from './provider'
import { learningDraftSchema, proposalDraftSchema } from './schemas'

type InternalSession = {
  publicSession: LearningSession
  answerKey: AnswerKey
  contextRequest: LearningRequest
  workspaceRoot: string
  passed: boolean
  attempts: number
  createdAt: number
}

type InternalChange = ProposedFileChange & {
  absolutePath: string
  expectedHash: string | null
}

type InternalProposal = {
  publicProposal: CodeProposal
  changes: InternalChange[]
  workspaceRoot: string
  createdAt: number
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
  getWorkspaceRoot: () => string | null
): void {
  const sessions = new Map<string, InternalSession>()
  const proposals = new Map<string, InternalProposal>()
  let sessionApiKey: string | null = null
  let activeController: AbortController | null = null
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

  async function runModel<T>(operation: (gateway: ModelGateway, signal: AbortSignal) => Promise<T>): Promise<T> {
    if (activeController) throw new Error('Another AI request is already running.')
    const controller = new AbortController()
    activeController = controller
    const timeout = setTimeout(() => controller.abort(), 120_000)
    const key = readApiKey()
    try {
      return await operation(new ModelGateway(getConfig(), key.value, codexRuntime), controller.signal)
    } catch (error) {
      throw cleanError(error, key.value)
    } finally {
      clearTimeout(timeout)
      if (activeController === controller) activeController = null
    }
  }

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

  ipcMain.handle(IPC_CHANNELS.agentStartLearning, async (_event, request: LearningRequest): Promise<LearningSession> => {
    pruneExpired()
    const rootPath = getWorkspaceRoot()
    if (!rootPath) throw new Error('Open a workspace before asking the tutor for a code change.')
    const intent = typeof request?.request === 'string' ? request.request.trim() : ''
    if (!intent || intent.length > maxRequestLength) throw new Error('Describe the change in 1 to 4,000 characters.')
    const passingScore = store.get('learningPassingScore') ?? 80
    const contextRequest: LearningRequest = {
      request: intent,
      activePath: typeof request.activePath === 'string' ? request.activePath : null,
      openPaths: Array.isArray(request.openPaths)
        ? request.openPaths.filter((filePath): filePath is string => typeof filePath === 'string').slice(0, 6)
        : []
    }
    const context = await buildWorkspaceContext(rootPath, contextRequest)
    const draft = await runModel((gateway, signal) => gateway.generateStructured(
      'learning',
      `Analyze this requested change and teach only the prerequisite concepts. Do not provide implementation code yet.
Create 2-5 concise concept lessons and 3-5 multiple-choice questions that test applied understanding, not trivia.

<user-request>\n${intent}\n</user-request>\n\n${context}`,
      learningDraftSchema,
      signal
    ))

    const sessionId = randomUUID()
    const quiz = draft.quiz.map((question, index) => ({
      id: `${sessionId}:${index}`,
      prompt: question.prompt,
      options: question.options
    }))
    const publicSession: LearningSession = {
      id: sessionId,
      request: intent,
      concepts: draft.concepts,
      lessonSummary: draft.lessonSummary,
      quiz,
      passingScore
    }
    sessions.set(sessionId, {
      publicSession,
      answerKey: draft.quiz.map((question, index) => ({
        questionId: quiz[index].id,
        correctOption: question.correctOption,
        explanation: question.explanation
      })),
      contextRequest,
      workspaceRoot: rootPath,
      passed: false,
      attempts: 0,
      createdAt: Date.now()
    })
    return publicSession
  })

  ipcMain.handle(IPC_CHANNELS.agentSubmitQuiz, (_event, submission: QuizSubmission): QuizResult => {
    pruneExpired()
    const session = sessions.get(submission?.sessionId)
    if (!session) throw new Error('This learning session expired. Start the request again.')
    if (session.attempts >= 3 && !session.passed) throw new Error('This quiz reached its attempt limit. Start a new learning session for fresh questions.')
    session.attempts += 1
    const result = gradeQuiz(submission, session.answerKey, session.publicSession.passingScore)
    session.passed = result.passed
    return result
  })

  ipcMain.handle(IPC_CHANNELS.agentGenerateProposal, async (_event, sessionId: string): Promise<CodeProposal> => {
    pruneExpired()
    const session = sessions.get(sessionId)
    if (!session) throw new Error('This learning session expired. Start the request again.')
    if (!session.passed) throw new Error('Pass the learning check before generating code.')
    const rootPath = getWorkspaceRoot()
    if (!rootPath) throw new Error('Open a workspace first.')
    if (rootPath !== session.workspaceRoot) throw new Error('Return to the workspace where this learning session started.')
    const currentContext = await buildWorkspaceContext(rootPath, session.contextRequest)

    const draft = await runModel((gateway, signal) => gateway.generateStructured(
      'proposal',
      `Create a minimal, production-quality implementation for the request below.
Return complete UTF-8 file contents for every changed file. Use only relative workspace paths.
You may create or update files, but never delete files. Do not modify secrets, .git, or node_modules.
Prefer the smallest coherent change and include concrete verification steps.

<user-request>\n${session.publicSession.request}\n</user-request>\n\n${currentContext}`,
      proposalDraftSchema,
      signal
    ))

    const internalChanges: InternalChange[] = []
    const proposedPaths = new Set<string>()
    for (const change of draft.changes) {
      const candidatePath = validateRelativeChangePath(rootPath, change.relativePath)
      let absolutePath = candidatePath
      let expectedHash: string | null = null
      if (change.action === 'update') {
        const resolvedPath = await fs.realpath(candidatePath).catch(() => null)
        if (!resolvedPath || !isPathInside(rootPath, resolvedPath)) throw new Error(`Cannot update missing file: ${change.relativePath}`)
        absolutePath = resolvedPath
        const existing = await fs.readFile(resolvedPath, 'utf8')
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
      internalChanges.push({ ...change, absolutePath, expectedHash })
    }

    const proposalId = randomUUID()
    const publicProposal: CodeProposal = {
      id: proposalId,
      sessionId,
      summary: draft.summary,
      changes: draft.changes,
      risks: draft.risks,
      verification: draft.verification
    }
    proposals.set(proposalId, { publicProposal, changes: internalChanges, workspaceRoot: rootPath, createdAt: Date.now() })
    return publicProposal
  })

  ipcMain.handle(IPC_CHANNELS.agentApplyProposal, async (event, proposalId: string): Promise<AppliedProposal> => {
    pruneExpired()
    const proposal = proposals.get(proposalId)
    if (!proposal) throw new Error('This proposal expired or was already applied.')
    const session = sessions.get(proposal.publicProposal.sessionId)
    if (!session?.passed) throw new Error('The learning gate is no longer unlocked.')
    const rootPath = getWorkspaceRoot()
    if (!rootPath) throw new Error('Open a workspace first.')
    if (rootPath !== proposal.workspaceRoot) throw new Error('Return to the workspace where this proposal was generated.')

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
      return { applied: false, changedPaths: [], workspace: await createWorkspaceSnapshot(rootPath) }
    }

    const originals = new Map<string, string | null>()
    try {
      for (const change of proposal.changes) {
        originals.set(change.absolutePath, change.action === 'update' ? await fs.readFile(change.absolutePath, 'utf8') : null)
        await fs.writeFile(change.absolutePath, change.content, change.action === 'create' ? { encoding: 'utf8', flag: 'wx' } : 'utf8')
      }
    } catch (error) {
      for (const [filePath, content] of [...originals.entries()].reverse()) {
        if (content === null) await fs.unlink(filePath).catch(() => undefined)
        else await fs.writeFile(filePath, content, 'utf8').catch(() => undefined)
      }
      throw error
    }

    proposals.delete(proposalId)
    return {
      applied: true,
      changedPaths: proposal.changes.map((change) => change.absolutePath),
      workspace: await createWorkspaceSnapshot(rootPath)
    }
  })

  ipcMain.on(IPC_CHANNELS.agentCancel, () => activeController?.abort())
}
