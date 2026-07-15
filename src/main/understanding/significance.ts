import type {
  ChangeInput,
  ChangeSignificanceLevel,
  ChangeSignificanceResult,
  UnderstandingSettings
} from '../../shared/contracts'

export const defaultUnderstandingSettings: UnderstandingSettings = {
  enabled: true,
  triggerLevel: 'major',
  passingScore: 80,
  minimumQuestions: 3,
  maximumQuestions: 5,
  allowRetryBeforeRemediation: true,
  requireBeforeAiApply: true,
  requireBeforeCommit: true,
  strictMode: false,
  developerBypass: false,
  bypassRequiresReason: true
}

const riskRules: Array<{
  id: string
  score: number
  concept: string
  reason: string
  path: RegExp
  content?: RegExp
}> = [
  { id: 'authentication', score: 55, concept: 'Authentication and authorization', reason: 'modifies authentication or authorization behavior', path: /(?:^|[\\/])(auth|session|oauth|login|permission|middleware)(?:[.\\/]|$)/i, content: /cookie|token|authorize|permission|session/i },
  { id: 'database_schema', score: 45, concept: 'Database schemas and migrations', reason: 'changes database schema or migration behavior', path: /migration|schema|prisma|drizzle|database|\.sql$/i, content: /alter\s+table|create\s+table|migration/i },
  { id: 'electron_ipc', score: 35, concept: 'Electron IPC boundaries', reason: 'changes an Electron IPC channel or preload bridge', path: /(?:^|[\\/])(?:preload|ipc)(?:[\\/]|\.(?:ts|js)$)|contracts\.(?:ts|js)$/i, content: /ipcMain|ipcRenderer|contextBridge|IPC_CHANNELS/ },
  { id: 'filesystem_access', score: 30, concept: 'Filesystem safety', reason: 'changes filesystem access', path: /(?:file|workspace|pathSafety|filesystem)/i, content: /\bfs\.|readFile|writeFile|unlink|realpath/ },
  { id: 'security_boundary', score: 25, concept: 'Application security boundaries', reason: 'changes security-sensitive application boundaries', path: /(?:preload|security|permission|credential|secret|electron)/i },
  { id: 'dependency_change', score: 35, concept: 'Dependency and supply-chain impact', reason: 'changes application dependencies', path: /(?:^|[\\/])package\.json$|(?:^|[\\/])(?:Cargo\.toml|pyproject\.toml|requirements\.txt)$/i },
  { id: 'public_api', score: 25, concept: 'API contracts', reason: 'changes a public API or shared interface', path: /(?:contracts|types|api|routes?|controller)/i, content: /export\s+(?:type|interface|class|function)|router\.|app\.(?:get|post|put|delete)/i },
  { id: 'state_management', score: 25, concept: 'State ownership and data flow', reason: 'changes shared state management', path: /(?:store|state|reducer|zustand|redux)/i, content: /create\(|setState|useStore|reducer/i },
  { id: 'network_access', score: 25, concept: 'Network requests and failure behavior', reason: 'changes network request behavior', path: /(?:client|network|fetch|api)/i, content: /\bfetch\(|axios|http\.|https\.|WebSocket/ },
  { id: 'concurrency', score: 25, concept: 'Asynchronous control flow', reason: 'changes asynchronous or concurrent behavior', path: /./, content: /Promise\.all|AbortController|worker|mutex|semaphore|queueMicrotask/ },
  { id: 'environment_secrets', score: 35, concept: 'Secrets and environment configuration', reason: 'changes secret or environment handling', path: /\.env|config|secret|credential/i, content: /process\.env|API_KEY|TOKEN|PASSWORD/ }
]

function levelFor(score: number): ChangeSignificanceLevel {
  if (score >= 85) return 'critical'
  if (score >= 55) return 'major'
  if (score >= 15) return 'minor'
  return 'trivial'
}

function isAtLeast(level: ChangeSignificanceLevel, threshold: 'minor' | 'major'): boolean {
  const ranks: Record<ChangeSignificanceLevel, number> = { trivial: 0, minor: 1, major: 2, critical: 3 }
  return ranks[level] >= ranks[threshold]
}

export function classifyChange(input: ChangeInput, settings: UnderstandingSettings): ChangeSignificanceResult {
  const additions = input.files.reduce((total, file) => total + Math.max(0, file.additions), 0)
  const deletions = input.files.reduce((total, file) => total + Math.max(0, file.deletions), 0)
  const lines = additions + deletions
  const combined = input.files.map((file) => `${file.path}\n${file.patch ?? ''}\n${file.afterContent ?? ''}`).join('\n')
  let score = Math.min(24, Math.ceil(lines / 40) * 6) + Math.min(18, Math.max(0, input.files.length - 1) * 4)
  const riskFactors: string[] = []
  const detectedConcepts: string[] = []
  const triggerReasons: string[] = []

  for (const rule of riskRules) {
    const matched = input.files.some((file) => rule.path.test(file.path) && (!rule.content || rule.content.test(`${file.path}\n${file.patch ?? ''}\n${file.afterContent ?? ''}`)))
    if (!matched) continue
    score += rule.score
    riskFactors.push(rule.id)
    detectedConcepts.push(rule.concept)
    triggerReasons.push(rule.reason)
  }

  const added = input.files.filter((file) => file.status === 'added').length
  const deleted = input.files.filter((file) => file.status === 'deleted').length
  if (added >= 3) { score += 12; triggerReasons.push(`adds ${added} new files`) }
  if (deleted > 0) { score += Math.min(20, deleted * 10); triggerReasons.push(`deletes ${deleted} file${deleted === 1 ? '' : 's'}`) }
  if (lines >= 300) { score += 18; triggerReasons.push(`changes ${lines} lines`) }
  if (input.files.length >= 5) { score += 15; triggerReasons.push(`spans ${input.files.length} files`) }
  if (typeof input.generatedCodeConfidence === 'number' && input.generatedCodeConfidence < 0.6) {
    score += 15
    riskFactors.push('low_generated_confidence')
    triggerReasons.push('has low generated-code confidence')
  }
  if (/\b(test|spec)\b/i.test(combined) && input.files.some((file) => file.status === 'deleted')) {
    score += 10
    riskFactors.push('test_removal')
    triggerReasons.push('removes test coverage')
  }

  score = Math.min(100, score)
  const level = levelFor(score)
  const sourceEnabled = input.source === 'ai_proposal' ? settings.requireBeforeAiApply : settings.requireBeforeCommit
  return {
    level,
    score,
    triggerReasons: [...new Set(triggerReasons.length ? triggerReasons : ['changes a small, isolated area'])],
    changedFiles: input.files.map((file) => file.path),
    detectedConcepts: [...new Set(detectedConcepts)],
    riskFactors: [...new Set(riskFactors)],
    recommendedQuizDepth: level === 'critical' ? 'deep' : level === 'major' || level === 'minor' ? 'standard' : 'none',
    quizRequired: settings.enabled && sourceEnabled && isAtLeast(level, settings.triggerLevel),
    additions,
    deletions
  }
}
