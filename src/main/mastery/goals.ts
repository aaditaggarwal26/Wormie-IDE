import type { LearningGoal } from '../../shared/contracts'

export function createGoal(input: Pick<LearningGoal, 'id' | 'title' | 'type' | 'target'> & Partial<Pick<LearningGoal, 'conceptId' | 'domain'>>, now: string): LearningGoal {
  const title = input.title.trim()
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.id) || !title || title.length > 120 || !Number.isFinite(input.target) || input.target < 1 || input.target > 1_000_000) throw new Error('Invalid learning goal.')
  const at = new Date(now).toISOString()
  return { id: input.id, title, type: input.type, target: Math.round(input.target), progress: 0, status: 'active', ...(input.conceptId ? { conceptId: input.conceptId.slice(0, 100) } : {}), ...(input.domain ? { domain: input.domain } : {}), createdAt: at, updatedAt: at }
}

export function progressGoals(goals: Record<string, LearningGoal>, event: { type: 'mastery' | 'review' | 'streak' | 'xp'; amount: number; conceptId?: string }, now: string): Record<string, LearningGoal> {
  const next = { ...goals }
  for (const [id, goal] of Object.entries(goals)) {
    const eventType = event.type === 'review' ? 'reviews' : event.type
    if (goal.status !== 'active' || goal.type !== eventType || (goal.conceptId && goal.conceptId !== event.conceptId)) continue
    const progress = Math.min(goal.target, Math.max(goal.progress, goal.progress + Math.max(0, event.amount)))
    const completed = progress >= goal.target
    next[id] = { ...goal, progress, status: completed ? 'completed' : 'active', updatedAt: new Date(now).toISOString(), ...(completed ? { completedAt: new Date(now).toISOString() } : {}) }
  }
  return next
}
