import type {
  AgentActivityEvent,
  AgentActivityFile,
  AgentActivityPhase,
  AgentActivityState
} from '../../shared/contracts'

const kinds = new Set(['phase', 'protocol', 'files'])
const phases = new Set<AgentActivityPhase>(['context', 'learning', 'model', 'validation', 'quiz', 'proposal', 'approval', 'apply', 'complete'])
const states = new Set<AgentActivityState>(['pending', 'active', 'completed', 'failed', 'stopped'])
const actions = new Set<AgentActivityFile['action']>(['create', 'update', 'applied'])
const protocolMethods = new Set(['item/started', 'item/completed', 'item/agentMessage/delta', 'turn/completed'])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function cleanText(value: unknown, maxLength: number, replaceControlsWithSpace: boolean): string {
  if (typeof value !== 'string') return ''
  const replacement = replaceControlsWithSpace ? ' ' : ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, replacement)
    .replace(replaceControlsWithSpace ? /\s+/g : /$^/g, ' ')
    .trim()
    .slice(0, maxLength)
}

export function sanitizeAgentActivity(value: unknown): AgentActivityEvent {
  const record = asRecord(value)
  const id = cleanText(record?.id, 100, false)
  const runId = cleanText(record?.runId, 100, false)
  const label = cleanText(record?.label, 120, true)
  if (
    !record || !id || !runId || !label ||
    typeof record.kind !== 'string' || !kinds.has(record.kind) ||
    typeof record.phase !== 'string' || !phases.has(record.phase as AgentActivityPhase) ||
    typeof record.state !== 'string' || !states.has(record.state as AgentActivityState)
  ) {
    throw new Error('Invalid agent activity event.')
  }

  const rawFiles = Array.isArray(record.files) ? record.files.slice(0, 50) : []
  const files = rawFiles.flatMap((value): AgentActivityFile[] => {
    const file = asRecord(value)
    const path = cleanText(file?.path, 260, true)
    if (!file || !path || typeof file.action !== 'string' || !actions.has(file.action as AgentActivityFile['action'])) return []
    return [{ path, action: file.action as AgentActivityFile['action'] }]
  })
  const timestamp = typeof record.timestamp === 'string' && !Number.isNaN(Date.parse(record.timestamp))
    ? new Date(record.timestamp).toISOString()
    : new Date().toISOString()
  const detail = cleanText(record.detail, 240, true)
  const protocolMethod = typeof record.protocolMethod === 'string' && protocolMethods.has(record.protocolMethod)
    ? record.protocolMethod
    : undefined

  return {
    id,
    runId,
    timestamp,
    kind: record.kind as AgentActivityEvent['kind'],
    phase: record.phase as AgentActivityPhase,
    label,
    state: record.state as AgentActivityState,
    ...(detail ? { detail } : {}),
    ...(protocolMethod ? { protocolMethod } : {}),
    ...(files.length > 0 ? { files } : {})
  }
}
