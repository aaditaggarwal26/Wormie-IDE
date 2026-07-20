import { createHash } from 'node:crypto'
import type { MasteryEvidence, MisconceptionRecord } from '../../shared/contracts'
import { normalizeConceptTerm } from './catalog'

export function applyMisconceptionEvidence(records: Record<string, MisconceptionRecord>, evidence: MasteryEvidence): Record<string, MisconceptionRecord> {
  const next = { ...records }
  if (evidence.misconceptionSummary && evidence.score < 0.7) {
    const normalized = normalizeConceptTerm(evidence.misconceptionSummary)
    const id = createHash('sha256').update(`${evidence.conceptId}:${normalized}`).digest('hex').slice(0, 32)
    const existing = next[id]
    next[id] = {
      id, conceptId: evidence.conceptId, summary: evidence.misconceptionSummary.slice(0, 300),
      correctiveExplanation: evidence.correctiveExplanation?.slice(0, 800) ?? 'Review the concept and explain the corrected mental model.',
      source: evidence.source, status: 'active', critical: Boolean(evidence.criticalMisconception) || Boolean(existing?.critical),
      recurrenceCount: (existing?.recurrenceCount ?? 0) + 1, firstSeenAt: existing?.firstSeenAt ?? evidence.occurredAt,
      lastSeenAt: evidence.occurredAt, lastEvidenceGroup: evidence.independenceGroup,
      evidenceIds: [...new Set([...(existing?.evidenceIds ?? []), evidence.id])].slice(-100)
    }
    return next
  }
  if (evidence.score >= 0.85) {
    for (const [id, item] of Object.entries(next)) {
      if (item.conceptId !== evidence.conceptId || item.status === 'resolved' || item.lastEvidenceGroup === evidence.independenceGroup || evidence.occurredAt <= item.lastSeenAt) continue
      next[id] = { ...item, status: 'resolved', resolvedAt: evidence.occurredAt, resolvingEvidenceId: evidence.id, evidenceIds: [...new Set([...item.evidenceIds, evidence.id])].slice(-100) }
    }
  }
  return next
}

export function completeRemediation(records: Record<string, MisconceptionRecord>, id: string, at: string): Record<string, MisconceptionRecord> {
  const item = records[id]
  if (!item || item.status === 'resolved') return records
  return { ...records, [id]: { ...item, status: 'remediated', remediationCompletedAt: new Date(at).toISOString() } }
}
