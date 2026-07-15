import type {
  AgentActivityEvent,
  AgentActivityFile,
  AgentActivityPhase,
  AgentActivityState
} from '@shared/contracts'

export type AgentActivityViewState = {
  runId: string
  phases: AgentActivityEvent[]
  technical: AgentActivityEvent[]
  files: Partial<Record<'proposal' | 'apply', AgentActivityFile[]>>
}

const phaseOrder: AgentActivityPhase[] = ['context', 'learning', 'model', 'validation', 'quiz', 'proposal', 'approval', 'apply', 'complete']
const phaseSet = new Set<AgentActivityPhase>(phaseOrder)
const stateSet = new Set<AgentActivityState>(['pending', 'active', 'completed', 'failed', 'stopped'])
const kindSet = new Set<AgentActivityEvent['kind']>(['phase', 'protocol', 'files'])
const protocolSet = new Set(['item/started', 'item/completed', 'item/agentMessage/delta', 'turn/completed'])
const actionSet = new Set<AgentActivityFile['action']>(['create', 'update', 'applied'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

export function isRenderableAgentActivity(value: unknown): value is AgentActivityEvent {
  if (!isRecord(value)) return false
  if (
    typeof value.id !== 'string' || !value.id || value.id.length > 100 ||
    typeof value.runId !== 'string' || !value.runId || value.runId.length > 100 ||
    typeof value.timestamp !== 'string' || Number.isNaN(Date.parse(value.timestamp)) ||
    typeof value.kind !== 'string' || !kindSet.has(value.kind as AgentActivityEvent['kind']) ||
    typeof value.phase !== 'string' || !phaseSet.has(value.phase as AgentActivityPhase) ||
    typeof value.label !== 'string' || !value.label || value.label.length > 120 ||
    typeof value.state !== 'string' || !stateSet.has(value.state as AgentActivityState)
  ) return false
  if (value.detail !== undefined && (typeof value.detail !== 'string' || value.detail.length > 240)) return false
  if (value.protocolMethod !== undefined && (typeof value.protocolMethod !== 'string' || !protocolSet.has(value.protocolMethod))) return false
  if (value.files !== undefined) {
    if (!Array.isArray(value.files) || value.files.length > 50) return false
    if (!value.files.every((file) => isRecord(file) && typeof file.path === 'string' && file.path.length <= 260 && typeof file.action === 'string' && actionSet.has(file.action as AgentActivityFile['action']))) return false
  }
  return true
}

export function initialAgentActivityState(runId: string): AgentActivityViewState {
  return { runId, phases: [], technical: [], files: {} }
}

export function reduceAgentActivity(state: AgentActivityViewState, event: AgentActivityEvent): AgentActivityViewState {
  if (event.runId !== state.runId) return state
  if (event.kind === 'protocol') {
    return { ...state, technical: [...state.technical, event].slice(-120) }
  }
  if (event.kind === 'files') {
    if (event.phase !== 'proposal' && event.phase !== 'apply') return state
    return { ...state, files: { ...state.files, [event.phase]: event.files ?? [] } }
  }
  const phases = [...state.phases.filter((item) => item.phase !== event.phase), event]
    .sort((left, right) => phaseOrder.indexOf(left.phase) - phaseOrder.indexOf(right.phase))
  return { ...state, phases }
}
