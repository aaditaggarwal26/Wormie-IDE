import type {
  DomainMasteryView,
  MasteryConceptView,
  MasteryEvidenceView,
  MasteryOverviewView,
  MasteryStatus,
  ReviewQueueItem
} from '@shared/contracts'

export type ConceptFilter = 'all' | 'weak' | 'review' | 'strong'
export type ConceptSort = 'priority' | 'mastery' | 'recent'

export const STATUS_LABELS: Record<MasteryStatus, string> = {
  unassessed: 'Unassessed',
  learning: 'Learning',
  weak: 'Weak',
  developing: 'Developing',
  proficient: 'Proficient',
  strong: 'Strong',
  review_due: 'Review due'
}

export function masteryPercent(value: number | null): string {
  return value === null ? 'No signal' : `${Math.round(value)}%`
}

export function confidenceLabel(value: number): string {
  if (value >= 0.75) return 'high confidence'
  if (value >= 0.4) return 'medium confidence'
  if (value > 0) return 'low confidence'
  return 'no evidence yet'
}

export function growthLabel(overview: MasteryOverviewView): string {
  const growth = overview.estimatedGrowth
  if (!growth) return 'Growth appears after multiple checks over time.'
  if (growth.pointsPer30Days > 0) return `+${growth.pointsPer30Days} pts / 30 days`
  if (growth.pointsPer30Days < 0) return `${growth.pointsPer30Days} pts / 30 days`
  return 'Stable over the current evidence window.'
}

export function sortDomains(domains: DomainMasteryView[]): DomainMasteryView[] {
  return [...domains].sort((left, right) => {
    if (left.mastery === null && right.mastery !== null) return 1
    if (left.mastery !== null && right.mastery === null) return -1
    return (right.reviewDueConcepts - left.reviewDueConcepts)
      || (right.weakConcepts - left.weakConcepts)
      || ((right.mastery ?? -1) - (left.mastery ?? -1))
      || left.domain.localeCompare(right.domain)
  })
}

export function filterConcepts(concepts: MasteryConceptView[], filter: ConceptFilter): MasteryConceptView[] {
  if (filter === 'weak') return concepts.filter((concept) => concept.status === 'weak' || concept.status === 'learning')
  if (filter === 'review') return concepts.filter((concept) => concept.status === 'review_due')
  if (filter === 'strong') return concepts.filter((concept) => concept.status === 'strong' || concept.status === 'proficient')
  return concepts
}

export function sortConcepts(concepts: MasteryConceptView[], sort: ConceptSort): MasteryConceptView[] {
  return [...concepts].sort((left, right) => {
    if (sort === 'mastery') return right.mastery - left.mastery || right.confidence - left.confidence || left.name.localeCompare(right.name)
    if (sort === 'recent') return dateScore(right.lastAssessedAt) - dateScore(left.lastAssessedAt) || left.name.localeCompare(right.name)
    return conceptPriority(right) - conceptPriority(left) || left.name.localeCompare(right.name)
  })
}

export function conceptPriority(concept: MasteryConceptView): number {
  const review = concept.status === 'review_due' ? 70 : 0
  const weakness = Math.max(0, 72 - concept.mastery)
  const evidenceNeed = Math.max(0, 1 - concept.confidence) * 18
  return review + weakness + evidenceNeed
}

export function evidenceSummary(evidence: MasteryEvidenceView[]): Array<{ label: string; count: number }> {
  const counts = new Map<string, number>()
  for (const item of evidence) counts.set(item.source, (counts.get(item.source) ?? 0) + 1)
  return [...counts].map(([label, count]) => ({ label, count })).sort((left, right) => right.count - left.count || left.label.localeCompare(right.label))
}

export function reviewRiskLabel(item: ReviewQueueItem): string {
  if (item.forgottenRisk >= 0.75) return 'high drift risk'
  if (item.forgottenRisk >= 0.45) return 'medium drift risk'
  return 'light review'
}

export function emptyProfileMessage(overview: MasteryOverviewView): string {
  if (overview.assessedConcepts > 0) return ''
  return 'No mastery estimate yet. Finish a learning check or major-change understanding check to add evidence.'
}

function dateScore(value: string | null): number {
  return value ? Date.parse(value) || 0 : 0
}
