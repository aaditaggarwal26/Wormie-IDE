import { useEffect } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { LearningGoalInput, ReviewSubmission } from '@shared/contracts'

export const MASTERY_UPDATED_EVENT = 'wormie:mastery-updated'

export const masteryQueryKeys = {
  all: ['mastery'] as const,
  overview: () => [...masteryQueryKeys.all, 'overview'] as const,
  domains: () => [...masteryQueryKeys.all, 'domains'] as const,
  concept: (conceptId: string | null) => [...masteryQueryKeys.all, 'concept', conceptId] as const,
  evidence: (conceptId: string | null) => [...masteryQueryKeys.all, 'evidence', conceptId] as const,
  reviews: () => [...masteryQueryKeys.all, 'reviews'] as const,
  misconceptions: () => [...masteryQueryKeys.all, 'misconceptions'] as const,
  personalization: () => [...masteryQueryKeys.all, 'personalization'] as const,
  goals: () => [...masteryQueryKeys.all, 'goals'] as const,
  gamification: () => [...masteryQueryKeys.all, 'gamification'] as const,
  sync: () => [...masteryQueryKeys.all, 'sync'] as const
}

export function notifyMasteryUpdated(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(MASTERY_UPDATED_EVENT))
}

export function useMasteryInvalidation(): void {
  const queryClient = useQueryClient()
  useEffect(() => {
    const refresh = () => {
      void queryClient.invalidateQueries({ queryKey: masteryQueryKeys.all })
      void queryClient.invalidateQueries({ queryKey: ['understandingHistory'] })
    }
    window.addEventListener(MASTERY_UPDATED_EVENT, refresh)
    return () => window.removeEventListener(MASTERY_UPDATED_EVENT, refresh)
  }, [queryClient])
}

export function useMasteryProfile(conceptId: string | null) {
  const overview = useQuery({ queryKey: masteryQueryKeys.overview(), queryFn: window.desktop.getMasteryOverview })
  const domains = useQuery({ queryKey: masteryQueryKeys.domains(), queryFn: window.desktop.getMasteryDomains })
  const reviews = useQuery({ queryKey: masteryQueryKeys.reviews(), queryFn: window.desktop.getMasteryReviews })
  const misconceptions = useQuery({ queryKey: masteryQueryKeys.misconceptions(), queryFn: () => window.desktop.getMasteryMisconceptions() })
  const goals = useQuery({ queryKey: masteryQueryKeys.goals(), queryFn: window.desktop.getLearningGoals })
  const gamification = useQuery({ queryKey: masteryQueryKeys.gamification(), queryFn: window.desktop.getLearningGamification })
  const sync = useQuery({ queryKey: masteryQueryKeys.sync(), queryFn: window.desktop.getMasterySyncStatus, refetchInterval: 30_000 })
  const detail = useQuery({
    enabled: Boolean(conceptId),
    queryKey: masteryQueryKeys.concept(conceptId),
    queryFn: () => window.desktop.getMasteryConcept(conceptId!)
  })

  return { overview, domains, reviews, misconceptions, goals, gamification, sync, detail }
}

export function useMasteryMutations() {
  const queryClient = useQueryClient()
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: masteryQueryKeys.all })
    notifyMasteryUpdated()
  }

  return {
    startReview: useMutation({ mutationFn: window.desktop.startMasteryReview }),
    submitReview: useMutation({
      mutationFn: (submission: ReviewSubmission) => window.desktop.submitMasteryReview(submission),
      onSuccess: refresh
    }),
    upsertGoal: useMutation({
      mutationFn: (input: LearningGoalInput) => window.desktop.createLearningGoal(input),
      onSuccess: refresh
    }),
    completeGoal: useMutation({
      mutationFn: (goalId: string) => window.desktop.updateLearningGoal(goalId, { status: 'completed' }),
      onSuccess: refresh
    })
  }
}
