import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ZodType } from 'zod'
import { isPathInside, validateEntryName } from '../pathSafety'
import {
  materializeProposalEdits,
  materializeResolvedProposalEdits,
  type ResolvedProposalTextEdit
} from './proposalEdits'
import { workspaceAgentStepSchema, type WorkspaceAgentStep } from './schemas'
import type { ModelOperation } from './provider'

type Model = {
  generateStructured<T>(
    kind: ModelOperation,
    prompt: string,
    schema: ZodType<T>,
    signal: AbortSignal,
    onProtocolEvent?: (method: string, detail: string) => void
  ): Promise<T>
}

type Piece =
  | { type: 'original'; start: number; end: number }
  | { type: 'inserted'; text: string }

type FileState = {
  relativePath: string
  original: string | null
  content: string
  tracker: TrackedText | null
}

type CheckCommand = { command: string; args: string[] }
type AvailableCheck = { id: string; label: string; commands: CheckCommand[] }
type CheckResult = { id: string; label: string; passed: boolean; output: string }

export type WorkspaceAgentChange = {
  relativePath: string
  action: 'create' | 'update'
  originalContent: string | null
  content: string
  explanation: string
  edits: ResolvedProposalTextEdit[] | null
  additions: number
  deletions: number
  patch: string
}

export type WorkspaceAgentProposal = {
  summary: string
  changes: WorkspaceAgentChange[]
  risks: string[]
  verification: string[]
}

type RunWorkspaceAgentOptions = {
  rootPath: string
  request: string
  model: Model
  signal: AbortSignal
  onProtocolEvent?: (method: string, detail: string) => void
  onActivity?: (label: string, detail: string) => void
}

const excludedDirectories = new Set(['.git', '.next', '.turbo', 'build', 'coverage', 'dist', 'node_modules', 'out', 'target'])
const protectedNames = new Set(['.env', '.npmrc', '.pypirc', 'auth.json', 'credentials', 'credentials.json', 'secrets.json'])
const protectedExtensions = new Set(['.key', '.pem', '.p12', '.pfx', '.keystore'])
const maxFileCharacters = 500_000
const maxObservationCharacters = 120_000
const maxSearchFileBytes = 256 * 1024
const maxSearchBytes = 4 * 1024 * 1024
const maxSteps = 18
const maxMutations = 12
const maxChecks = 3

function pieceLength(piece: Piece): number {
  return piece.type === 'original' ? piece.end - piece.start : piece.text.length
}

function normalizePieces(pieces: Piece[]): Piece[] {
  const normalized: Piece[] = []
  for (const piece of pieces) {
    if (pieceLength(piece) === 0) continue
    const previous = normalized.at(-1)
    if (previous?.type === 'inserted' && piece.type === 'inserted') previous.text += piece.text
    else if (previous?.type === 'original' && piece.type === 'original' && previous.end === piece.start) previous.end = piece.end
    else normalized.push({ ...piece })
  }
  return normalized
}

function splitPieces(pieces: Piece[], offset: number): [Piece[], Piece[]] {
  const before: Piece[] = []
  const after: Piece[] = []
  let cursor = 0
  for (const piece of pieces) {
    const length = pieceLength(piece)
    if (cursor + length <= offset) before.push({ ...piece })
    else if (cursor >= offset) after.push({ ...piece })
    else {
      const local = offset - cursor
      if (piece.type === 'original') {
        before.push({ type: 'original', start: piece.start, end: piece.start + local })
        after.push({ type: 'original', start: piece.start + local, end: piece.end })
      } else {
        before.push({ type: 'inserted', text: piece.text.slice(0, local) })
        after.push({ type: 'inserted', text: piece.text.slice(local) })
      }
    }
    cursor += length
  }
  return [normalizePieces(before), normalizePieces(after)]
}

export class TrackedText {
  private pieces: Piece[]

  constructor(private readonly original: string) {
    this.pieces = original ? [{ type: 'original', start: 0, end: original.length }] : []
  }

  apply(start: number, end: number, newText: string): void {
    const length = this.pieces.reduce((total, piece) => total + pieceLength(piece), 0)
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end > length) {
      throw new Error('The edit range is invalid.')
    }
    const [before, remainder] = splitPieces(this.pieces, start)
    const [, after] = splitPieces(remainder, end - start)
    this.pieces = normalizePieces([
      ...before,
      ...(newText ? [{ type: 'inserted', text: newText } as Piece] : []),
      ...after
    ])
  }

  edits(): ResolvedProposalTextEdit[] {
    const edits: ResolvedProposalTextEdit[] = []
    let originalCursor = 0
    let inserted = ''
    for (const piece of this.pieces) {
      if (piece.type === 'inserted') {
        inserted += piece.text
        continue
      }
      if (piece.start > originalCursor || inserted) {
        edits.push({
          start: originalCursor,
          end: piece.start,
          oldText: this.original.slice(originalCursor, piece.start),
          newText: inserted
        })
      }
      originalCursor = piece.end
      inserted = ''
    }
    if (originalCursor < this.original.length || inserted) {
      edits.push({
        start: originalCursor,
        end: this.original.length,
        oldText: this.original.slice(originalCursor),
        newText: inserted
      })
    }
    return edits.filter((edit) => edit.oldText !== edit.newText)
  }
}

function isProtectedPath(relativePath: string): boolean {
  const segments = relativePath.split(/[\\/]/).map((segment) => segment.toLowerCase())
  const name = segments.at(-1) ?? ''
  return segments.some((segment) => segment === '.git' || segment === 'node_modules') ||
    protectedNames.has(name) || name.startsWith('.env.') || protectedExtensions.has(path.extname(name)) ||
    /(?:^|[._-])(secret|credential|private-key)/i.test(name)
}

function cleanRelativePath(rootPath: string, value: string): { relativePath: string; absolutePath: string } {
  if (
    typeof value !== 'string' || !value || value.includes('\0') ||
    path.isAbsolute(value) || path.win32.isAbsolute(value) || path.posix.isAbsolute(value)
  ) throw new Error('Use a relative workspace path.')
  const segments = value.split(/[\\/]/)
  if (segments.some((segment) => !segment)) throw new Error('Use a valid workspace path.')
  segments.forEach(validateEntryName)
  const relativePath = path.join(...segments)
  const absolutePath = path.resolve(rootPath, relativePath)
  if (!isPathInside(rootPath, absolutePath) || isProtectedPath(relativePath)) throw new Error('That path is protected.')
  return { relativePath, absolutePath }
}

function displayPath(relativePath: string): string {
  return relativePath.split(path.sep).join('/')
}

function redactOutput(value: string): string {
  return value
    .replace(/-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g, '[REDACTED PRIVATE KEY]')
    .replace(/\b(?:sk-[A-Za-z0-9_-]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{16,}|AKIA[A-Z0-9]{16})\b/g, '[REDACTED TOKEN]')
    .slice(-16_000)
}

function shellTokens(command: string): string[] | null {
  if (/[|;><`$()\r\n]/.test(command)) return null
  const tokens = command.match(/"(?:[^"\\]|\\.)*"|'[^']*'|&&|[^\s]+/g) ?? []
  return tokens.map((token) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) return token.slice(1, -1)
    return token
  })
}

const allowedCheckCommands = new Set(['eslint', 'jest', 'prettier', 'tsc', 'vitest'])

export function parseCheckScript(name: string, scripts: Record<string, string>): CheckCommand[] | null {
  const expand = (scriptName: string, depth: number): CheckCommand[] | null => {
    if (depth > 4) return null
    const command = scripts[scriptName]
    if (typeof command !== 'string') return null
    const tokens = shellTokens(command)
    if (!tokens?.length) return null
    const segments: string[][] = [[]]
    for (const token of tokens) {
      if (token === '&&') segments.push([])
      else segments.at(-1)?.push(token)
    }
    const result: CheckCommand[] = []
    for (const segment of segments) {
      const executable = path.basename(segment[0] ?? '').replace(/\.(?:cmd|exe)$/i, '')
      if (['npm', 'pnpm', 'yarn'].includes(executable)) {
        const nested = executable === 'npm' && segment[1] === 'test'
          ? 'test'
          : segment[1] === 'run' ? segment[2] : executable === 'yarn' ? segment[1] : null
        if (!nested) return null
        const expanded = expand(nested, depth + 1)
        if (!expanded) return null
        result.push(...expanded)
      } else {
        if (!allowedCheckCommands.has(executable)) return null
        result.push({ command: executable, args: segment.slice(1) })
      }
    }
    return result.length ? result : null
  }
  return expand(name, 0)
}

async function availableChecks(rootPath: string): Promise<AvailableCheck[]> {
  const checks: AvailableCheck[] = []
  try {
    const packageJson = JSON.parse(await fs.readFile(path.join(rootPath, 'package.json'), 'utf8')) as { scripts?: Record<string, string> }
    const scripts = packageJson.scripts ?? {}
    checks.push(...Object.keys(scripts)
      .filter((name) => /^(?:test|typecheck|check|lint)(?::[a-z0-9_-]+)?$/i.test(name))
      .flatMap((name): AvailableCheck[] => {
        const commands = parseCheckScript(name, scripts)
        return commands ? [{ id: `package:${name}`, label: `npm run ${name}`, commands }] : []
      })
      .slice(0, 8))
  } catch { /* This workspace is not a Node package. */ }

  const hasFile = (name: string) => fs.stat(path.join(rootPath, name)).then((stats) => stats.isFile()).catch(() => false)
  if (await hasFile('Cargo.toml')) checks.push({
    id: 'rust:test',
    label: 'cargo test --offline',
    commands: [{ command: 'cargo', args: ['test', '--offline'] }]
  })
  if (await hasFile('go.mod')) checks.push({
    id: 'go:test',
    label: 'go test ./...',
    commands: [{ command: 'go', args: ['test', './...'] }]
  })
  if (await hasFile('pyproject.toml') || await hasFile('pytest.ini')) checks.push({
    id: 'python:test',
    label: 'python -m pytest',
    commands: [{ command: process.platform === 'win32' ? 'python' : 'python3', args: ['-m', 'pytest'] }]
  })
  return checks.slice(0, 10)
}

class AgentWorkspace {
  private readonly states = new Map<string, FileState>()
  private readonly explicitlyRead = new Set<string>()

  constructor(private readonly rootPath: string) {}

  private async stateFor(relativePathValue: string): Promise<FileState> {
    const resolved = cleanRelativePath(this.rootPath, relativePathValue)
    const existing = this.states.get(resolved.relativePath)
    if (existing) return existing
    const realPath = await fs.realpath(resolved.absolutePath).catch(() => null)
    if (!realPath || !isPathInside(this.rootPath, realPath)) throw new Error(`File not found: ${displayPath(resolved.relativePath)}`)
    const stats = await fs.stat(realPath)
    if (!stats.isFile() || stats.size > maxFileCharacters * 4) throw new Error('Only reasonably sized text files can be read.')
    const content = await fs.readFile(realPath, 'utf8')
    if (content.includes('\0') || content.length > maxFileCharacters) throw new Error('Only UTF-8 text files up to 500,000 characters can be edited.')
    const state: FileState = {
      relativePath: resolved.relativePath,
      original: content,
      content,
      tracker: new TrackedText(content)
    }
    this.states.set(resolved.relativePath, state)
    return state
  }

  async manifest(): Promise<string> {
    const files = await this.walkFiles(this.rootPath, 400)
    return files.map((filePath) => displayPath(path.relative(this.rootPath, filePath))).join('\n')
  }

  async read(relativePath: string, startLine = 1, endLine?: number): Promise<string> {
    const state = await this.stateFor(relativePath)
    this.explicitlyRead.add(state.relativePath)
    const lines = state.content.split(/\r?\n/)
    const start = Math.min(Math.max(startLine, 1), Math.max(lines.length, 1))
    const end = Math.min(Math.max(endLine ?? start + 399, start), start + 399, lines.length)
    return lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join('\n') || '(empty file)'
  }

  async search(query: string, scope?: string): Promise<string> {
    const normalizedQuery = query.toLowerCase()
    const scopePath = scope ? cleanRelativePath(this.rootPath, scope).absolutePath : this.rootPath
    const realScope = await fs.realpath(scopePath).catch(() => null)
    if (!realScope || !isPathInside(this.rootPath, realScope)) throw new Error('Search path not found.')
    const stats = await fs.stat(realScope)
    const files = stats.isFile() ? [realScope] : await this.walkFiles(realScope, 1_000)
    const results: string[] = []
    let searchedBytes = 0
    const seen = new Set<string>()
    for (const filePath of files) {
      const relativePath = path.relative(this.rootPath, filePath)
      if (isProtectedPath(relativePath)) continue
      seen.add(relativePath)
      const state = this.states.get(relativePath)
      const stat = state ? null : await fs.stat(filePath)
      if (stat && (stat.size > maxSearchFileBytes || searchedBytes + stat.size > maxSearchBytes)) continue
      const content = state?.content ?? await fs.readFile(filePath, 'utf8').catch(() => '')
      searchedBytes += content.length
      if (content.includes('\0')) continue
      if (displayPath(relativePath).toLowerCase().includes(normalizedQuery)) results.push(`${displayPath(relativePath)} (path match)`)
      for (const [index, line] of content.split(/\r?\n/).entries()) {
        if (line.toLowerCase().includes(normalizedQuery)) results.push(`${displayPath(relativePath)}:${index + 1}: ${line.trim().slice(0, 300)}`)
        if (results.length >= 40) return results.join('\n')
      }
    }
    for (const state of this.states.values()) {
      if (seen.has(state.relativePath) || state.original !== null) continue
      if (displayPath(state.relativePath).toLowerCase().includes(normalizedQuery)) results.push(`${displayPath(state.relativePath)} (new path match)`)
      for (const [index, line] of state.content.split(/\r?\n/).entries()) {
        if (line.toLowerCase().includes(normalizedQuery)) results.push(`${displayPath(state.relativePath)}:${index + 1}: ${line.trim().slice(0, 300)}`)
        if (results.length >= 40) return results.join('\n')
      }
    }
    return results.join('\n') || 'No matches.'
  }

  async edit(relativePath: string, oldText: string, newText: string): Promise<string> {
    const state = await this.stateFor(relativePath)
    if (!this.explicitlyRead.has(state.relativePath)) throw new Error('Read the file before editing it.')
    const materialized = materializeProposalEdits(state.content, [{ oldText, newText }], displayPath(state.relativePath))
    if (state.tracker) {
      for (const edit of [...materialized.edits].reverse()) state.tracker.apply(edit.start, edit.end, edit.newText)
    }
    state.content = materialized.content
    return `${displayPath(state.relativePath)} updated (${materialized.additions} added, ${materialized.deletions} removed).`
  }

  async create(relativePathValue: string, content: string): Promise<string> {
    if (content.includes('\0') || content.length > maxFileCharacters) throw new Error('The new file content is invalid.')
    const resolved = cleanRelativePath(this.rootPath, relativePathValue)
    if (this.states.has(resolved.relativePath)) throw new Error('That path is already part of this run.')
    const parent = await fs.realpath(path.dirname(resolved.absolutePath)).catch(() => null)
    if (!parent || !isPathInside(this.rootPath, parent)) throw new Error('Create files only in existing workspace folders.')
    try {
      await fs.access(resolved.absolutePath)
      throw new Error('That file already exists. Use edit_file instead.')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    this.states.set(resolved.relativePath, { relativePath: resolved.relativePath, original: null, content, tracker: null })
    return `${displayPath(resolved.relativePath)} created in the shadow workspace.`
  }

  changedStates(): FileState[] {
    return [...this.states.values()].filter((state) => state.original === null || state.content !== state.original)
  }

  async runCheck(check: AvailableCheck, signal: AbortSignal): Promise<CheckResult> {
    const shadow = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-agent-'))
    try {
      await this.copyWorkspace(this.rootPath, shadow)
      const sourceModules = path.join(this.rootPath, 'node_modules')
      if (await fs.stat(sourceModules).then((stats) => stats.isDirectory()).catch(() => false)) {
        await fs.symlink(sourceModules, path.join(shadow, 'node_modules'), process.platform === 'win32' ? 'junction' : 'dir')
      }
      for (const state of this.changedStates()) {
        const target = path.join(shadow, state.relativePath)
        await fs.mkdir(path.dirname(target), { recursive: true })
        await fs.writeFile(target, state.content, 'utf8')
      }
      let output = ''
      for (const command of check.commands) {
        const result = await this.runCommand(shadow, command, signal)
        output += `$ ${command.command} ${command.args.join(' ')}\n${result.output}\n`
        if (!result.passed) return { id: check.id, label: check.label, passed: false, output: redactOutput(output) }
      }
      return { id: check.id, label: check.label, passed: true, output: redactOutput(output) }
    } finally {
      await fs.rm(shadow, { recursive: true, force: true }).catch(() => undefined)
    }
  }

  private async walkFiles(startPath: string, limit: number): Promise<string[]> {
    const result: string[] = []
    const visit = async (directory: string): Promise<void> => {
      if (result.length >= limit) return
      const entries = await fs.readdir(directory, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (result.length >= limit) return
        const entryPath = path.join(directory, entry.name)
        const relativePath = path.relative(this.rootPath, entryPath)
        if (entry.isSymbolicLink() || isProtectedPath(relativePath)) continue
        if (entry.isDirectory()) {
          if (!excludedDirectories.has(entry.name.toLowerCase())) await visit(entryPath)
        } else if (entry.isFile()) result.push(entryPath)
      }
    }
    await visit(startPath)
    return result
  }

  private async copyWorkspace(source: string, destination: string): Promise<void> {
    let files = 0
    let bytes = 0
    const visit = async (sourceDirectory: string, destinationDirectory: string): Promise<void> => {
      await fs.mkdir(destinationDirectory, { recursive: true })
      const entries = await fs.readdir(sourceDirectory, { withFileTypes: true })
      for (const entry of entries) {
        const sourcePath = path.join(sourceDirectory, entry.name)
        const relativePath = path.relative(this.rootPath, sourcePath)
        if (entry.isSymbolicLink() || isProtectedPath(relativePath)) continue
        if (entry.isDirectory()) {
          if (!excludedDirectories.has(entry.name.toLowerCase())) await visit(sourcePath, path.join(destinationDirectory, entry.name))
          continue
        }
        if (!entry.isFile()) continue
        const stats = await fs.stat(sourcePath)
        files += 1
        bytes += stats.size
        if (files > 8_000 || bytes > 150 * 1024 * 1024) throw new Error('The workspace is too large for isolated verification.')
        await fs.copyFile(sourcePath, path.join(destinationDirectory, entry.name))
      }
    }
    await visit(source, destination)
  }

  private async runCommand(cwd: string, command: CheckCommand, signal: AbortSignal): Promise<{ passed: boolean; output: string }> {
    const localCommand = path.join(this.rootPath, 'node_modules', '.bin', `${command.command}${process.platform === 'win32' ? '.cmd' : ''}`)
    const executable = await fs.access(localCommand).then(() => localCommand).catch(() => command.command)
    const environment: NodeJS.ProcessEnv = { CI: '1', NO_COLOR: '1' }
    for (const name of ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'ComSpec', 'TMPDIR', 'TEMP', 'TMP', 'LANG', 'LC_ALL']) {
      if (process.env[name] !== undefined) environment[name] = process.env[name]
    }
    return new Promise((resolve, reject) => {
      let settled = false
      let output = ''
      const child = spawn(executable, command.args, {
        cwd,
        env: environment,
        shell: false,
        windowsHide: true
      })
      const finish = (result: { passed: boolean; output: string }) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal.removeEventListener('abort', abort)
        resolve(result)
      }
      const abort = () => {
        child.kill()
        if (!settled) {
          settled = true
          clearTimeout(timeout)
          reject(new DOMException('The agent check was cancelled.', 'AbortError'))
        }
      }
      const timeout = setTimeout(() => {
        child.kill()
        finish({ passed: false, output: `${output}\nCheck timed out after 60 seconds.` })
      }, 60_000)
      child.stdout.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-16_000) })
      child.stderr.on('data', (chunk: Buffer) => { output = `${output}${chunk.toString()}`.slice(-16_000) })
      child.once('error', (error) => finish({ passed: false, output: `${output}\n${error.message}` }))
      child.once('exit', (code) => finish({ passed: code === 0, output }))
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
  }
}

function observationText(observations: string[]): string {
  const joined = observations.join('\n\n')
  return joined.length <= maxObservationCharacters ? joined : `[earlier observations omitted]\n${joined.slice(-maxObservationCharacters)}`
}

function actionLabel(action: WorkspaceAgentStep['action']): string {
  if (action.type === 'search') return 'Searching the workspace'
  if (action.type === 'read_file') return `Reading ${action.relativePath}`
  if (action.type === 'edit_file') return `Editing ${action.relativePath}`
  if (action.type === 'create_file') return `Creating ${action.relativePath}`
  if (action.type === 'run_check') return `Running ${action.checkId}`
  return 'Finalizing the proposal'
}

export async function runWorkspaceAgent(options: RunWorkspaceAgentOptions): Promise<WorkspaceAgentProposal> {
  const rootPath = await fs.realpath(options.rootPath)
  const workspace = new AgentWorkspace(rootPath)
  const checks = await availableChecks(rootPath)
  const manifest = await workspace.manifest()
  const observations = [`Workspace manifest (paths only):\n${manifest || '(empty workspace)'}`]
  const checkResults: CheckResult[] = []
  let mutations = 0
  let mutationVersion = 0
  let passedVersion = -1
  let finish: Extract<WorkspaceAgentStep['action'], { type: 'finish' }> | null = null
  const repeatedActions = new Map<string, number>()

  for (let stepNumber = 1; stepNumber <= maxSteps; stepNumber += 1) {
    const changedPaths = workspace.changedStates().map((state) => displayPath(state.relativePath))
    const prompt = `Act as a bounded repository coding agent. Understand the existing implementation before editing it.
Use one action per turn. Search and read exact files before editing. edit_file performs one exact, uniquely anchored replacement in the shadow workspace; it never writes to the user's live project. Prefer several small edits over replacing a complete file. Use create_file only for genuinely new files. Never delete files.
After edits, run the most relevant available check. If it fails, inspect the output, make the smallest repair, and rerun it. Finish only when the implementation is coherent. Do not claim a check passed unless an observation says it passed.

Available checks: ${checks.length ? checks.map((check) => `${check.id} (${check.label})`).join(', ') : 'none'}
Changed paths: ${changedPaths.join(', ') || 'none'}
Step: ${stepNumber}/${maxSteps}; mutations: ${mutations}/${maxMutations}; checks: ${checkResults.length}/${maxChecks}

<user-request>\n${options.request}\n</user-request>

<tool-observations>\n${observationText(observations)}\n</tool-observations>`
    const step = await options.model.generateStructured(
      'workspace-step',
      prompt,
      workspaceAgentStepSchema,
      options.signal,
      options.onProtocolEvent
    )
    options.onActivity?.(actionLabel(step.action), step.note)
    const actionKey = JSON.stringify(step.action)
    const repeated = (repeatedActions.get(actionKey) ?? 0) + 1
    repeatedActions.set(actionKey, repeated)
    if (repeated > 2) {
      observations.push(`Step ${stepNumber}: Repeated action rejected. Choose a different action based on existing observations.`)
      continue
    }

    try {
      if (step.action.type === 'search') {
        observations.push(`Step ${stepNumber} search result:\n${await workspace.search(step.action.query, step.action.path)}`)
      } else if (step.action.type === 'read_file') {
        observations.push(`Step ${stepNumber} ${step.action.relativePath}:\n${await workspace.read(step.action.relativePath, step.action.startLine, step.action.endLine)}`)
      } else if (step.action.type === 'edit_file') {
        if (mutations >= maxMutations) throw new Error('Mutation limit reached. Finish with the current changes.')
        observations.push(`Step ${stepNumber}: ${await workspace.edit(step.action.relativePath, step.action.oldText, step.action.newText)}`)
        mutations += 1
        mutationVersion += 1
      } else if (step.action.type === 'create_file') {
        if (mutations >= maxMutations) throw new Error('Mutation limit reached. Finish with the current changes.')
        observations.push(`Step ${stepNumber}: ${await workspace.create(step.action.relativePath, step.action.content)}`)
        mutations += 1
        mutationVersion += 1
      } else if (step.action.type === 'run_check') {
        if (checkResults.length >= maxChecks) throw new Error('Check limit reached. Finish and report the latest result.')
        const checkId = step.action.checkId
        const check = checks.find((candidate) => candidate.id === checkId)
        if (!check) throw new Error('Choose one of the available check IDs.')
        const result = await workspace.runCheck(check, options.signal)
        checkResults.push(result)
        if (result.passed) passedVersion = mutationVersion
        observations.push(`Step ${stepNumber} ${result.label}: ${result.passed ? 'PASSED' : 'FAILED'}\n${result.output}`)
      } else {
        const changed = workspace.changedStates()
        if (!changed.length) throw new Error('No effective file changes exist yet.')
        const explained = new Set(step.action.explanations.map((item) => path.normalize(item.relativePath)))
        const missing = changed.filter((state) => !explained.has(state.relativePath)).map((state) => displayPath(state.relativePath))
        if (missing.length) throw new Error(`Add explanations for: ${missing.join(', ')}`)
        if (checks.length && passedVersion !== mutationVersion && checkResults.length < maxChecks) {
          throw new Error('Run an available check against the latest edits before finishing.')
        }
        finish = step.action
        break
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The action failed.'
      observations.push(`Step ${stepNumber} action error: ${message.slice(0, 600)}`)
    }
  }

  if (!finish) throw new Error('The coding agent reached its bounded step limit before producing a reviewable proposal.')
  const explanations = new Map(finish.explanations.map((item) => [path.normalize(item.relativePath), item.explanation]))
  const changes = workspace.changedStates().slice(0, 12).map((state): WorkspaceAgentChange => {
    const explanation = explanations.get(state.relativePath) ?? 'Implement the requested behavior.'
    if (state.original === null) {
      const additions = state.content.split(/\r?\n/).length
      return {
        relativePath: displayPath(state.relativePath),
        action: 'create',
        originalContent: null,
        content: state.content,
        explanation,
        edits: null,
        additions,
        deletions: 0,
        patch: `--- /dev/null\n+++ after/${displayPath(state.relativePath)}\n${state.content.split(/\r?\n/).map((line) => `+${line}`).join('\n')}`.slice(0, 18_000)
      }
    }
    const edits = state.tracker?.edits() ?? []
    const materialized = materializeResolvedProposalEdits(state.original, edits, displayPath(state.relativePath))
    return {
      relativePath: displayPath(state.relativePath),
      action: 'update',
      originalContent: state.original,
      content: materialized.content,
      explanation,
      edits: materialized.edits,
      additions: materialized.additions,
      deletions: materialized.deletions,
      patch: materialized.patch
    }
  })
  const verification = [
    ...finish.verification,
    ...checkResults.map((result) => `${result.passed ? 'Passed' : 'Failed'}: ${result.label}`)
  ]
  const failedChecks = checkResults.filter((result) => !result.passed)
  return {
    summary: finish.summary,
    changes,
    risks: [
      ...finish.risks,
      ...(failedChecks.length ? [`Automated verification did not pass: ${failedChecks.map((result) => result.label).join(', ')}`] : [])
    ],
    verification: verification.length ? verification.slice(0, 10) : ['Review the proposed diff before applying it.']
  }
}
