import type { GamificationState, LearningAward, MasteryEvidenceFormat } from '../../shared/contracts'

export type RewardEvent =
  | { id: string; evidenceId: string; type: 'evidence'; occurredAt: string; score: number; difficulty: 'easy' | 'medium' | 'hard'; format: MasteryEvidenceFormat; attempt: number; conceptId?: string }
  | { id: string; type: 'review_completed' | 'misconception_resolved' | 'goal_completed'; occurredAt: string; evidenceId?: string; conceptId?: string }
  | { id: string; type: 'bypass'; occurredAt: string }

export function createEmptyGamification(): GamificationState {
  return { totalXp: 0, level: 1, dailyStreak: 0, weeklyStreak: 0, activeDates: [], awards: {}, processedEventIds: {} }
}

function consecutiveDays(dates: string[]): number {
  const sorted = [...new Set(dates)].sort().reverse()
  if (!sorted.length) return 0
  let count = 1
  for (let index = 1; index < sorted.length; index += 1) {
    const difference = (Date.parse(`${sorted[index - 1]}T00:00:00.000Z`) - Date.parse(`${sorted[index]}T00:00:00.000Z`)) / 86_400_000
    if (difference !== 1) break
    count += 1
  }
  return count
}

function isoWeek(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`)
  const day = value.getUTCDay() || 7
  value.setUTCDate(value.getUTCDate() + 4 - day)
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1))
  return `${value.getUTCFullYear()}-${Math.ceil((((value.getTime() - yearStart.getTime()) / 86_400_000) + 1) / 7)}`
}

function award(event: RewardEvent, ruleId: string, kind: LearningAward['kind'], xp: number, reason: string): LearningAward {
  return { id: `${event.id}:${ruleId}`, ruleId, kind, xp, reason, earnedAt: new Date(event.occurredAt).toISOString(), ...('evidenceId' in event && event.evidenceId ? { evidenceId: event.evidenceId } : {}), ...('conceptId' in event && event.conceptId ? { conceptId: event.conceptId } : {}), ruleVersion: 1 }
}

export function applyRewardEvent(state: GamificationState, event: RewardEvent): GamificationState {
  if (state.processedEventIds[event.id] || event.type === 'bypass') return state
  const awards: LearningAward[] = []
  if (event.type === 'evidence') {
    if (event.score < 0.7 || (event.difficulty === 'easy' && event.attempt > 1)) return state
    const base = event.difficulty === 'hard' ? 22 : event.difficulty === 'medium' ? 15 : 10
    const applied = ['short_answer', 'spot_the_bug', 'predict_behavior', 'challenge', 'teacher_review'].includes(event.format) ? 1.2 : 1
    awards.push(award(event, 'evidence-xp', 'xp', Math.round(base * applied), `Demonstrated ${event.difficulty} applied understanding.`))
    if (event.score === 1 && event.attempt === 1 && event.difficulty !== 'easy') awards.push(award(event, 'perfect-score', 'achievement', 5, 'Perfect first-attempt score on a meaningful assessment.'))
  } else if (event.type === 'review_completed') awards.push(award(event, 'review-complete', 'xp', 12, 'Completed a scheduled review.'))
  else if (event.type === 'misconception_resolved') awards.push(award(event, 'misconception-resolved', 'achievement', 20, 'Resolved a recurring misconception with independent evidence.'))
  else awards.push(award(event, 'goal-complete', 'milestone', 30, 'Completed a learning goal.'))
  const nextAwards = { ...state.awards, ...Object.fromEntries(awards.map((item) => [item.id, item])) }
  const totalXp = Object.values(nextAwards).reduce((sum, item) => sum + item.xp, 0)
  const date = event.occurredAt.slice(0, 10)
  const activeDates = [...new Set([...state.activeDates, date])].sort().slice(-400)
  return {
    totalXp, level: Math.floor(Math.sqrt(totalXp / 100)) + 1,
    dailyStreak: consecutiveDays(activeDates), weeklyStreak: new Set(activeDates.map(isoWeek)).size,
    activeDates, awards: nextAwards, processedEventIds: { ...state.processedEventIds, [event.id]: true }
  }
}
