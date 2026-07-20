import type { ExplicitLearningPreferences, MasteryEvidenceFormat, PersonalizationState } from '../../shared/contracts'

export function createDefaultPersonalization(): PersonalizationState {
  return {
    explicit: { teachingStyle: 'balanced', lessonVerbosity: 'standard', exampleStyle: 'mixed', quizDifficulty: 'adaptive', reviewTolerance: 'balanced', inferenceEnabled: true },
    inferred: { preferredFormats: [], weakConceptIds: [], strongConceptIds: [], recurringMisconceptions: [], observations: 0, updatedAt: null }
  }
}

export function updateExplicitPreferences(state: PersonalizationState, update: Partial<ExplicitLearningPreferences>): PersonalizationState {
  return { ...state, explicit: { ...state.explicit, ...update } }
}

export function inferPreference(state: PersonalizationState, input: { conceptId: string; format: MasteryEvidenceFormat; score: number; misconception?: string }, at: string): PersonalizationState {
  if (!state.explicit.inferenceEnabled) return state
  const weak = input.score < 0.5 ? [...new Set([...state.inferred.weakConceptIds, input.conceptId])].slice(-50) : state.inferred.weakConceptIds.filter((id) => id !== input.conceptId)
  const strong = input.score >= 0.85 ? [...new Set([...state.inferred.strongConceptIds, input.conceptId])].slice(-50) : state.inferred.strongConceptIds
  const formats = input.score >= 0.7 ? [...new Set([...state.inferred.preferredFormats, input.format])].slice(-10) : state.inferred.preferredFormats
  return { ...state, inferred: {
    preferredFormats: formats, weakConceptIds: weak, strongConceptIds: strong,
    recurringMisconceptions: input.misconception ? [...new Set([...state.inferred.recurringMisconceptions, input.misconception.slice(0, 200)])].slice(-20) : state.inferred.recurringMisconceptions,
    observations: state.inferred.observations + 1, updatedAt: new Date(at).toISOString()
  } }
}

export function resetInferredPreferences(state: PersonalizationState): PersonalizationState {
  return { explicit: state.explicit, inferred: createDefaultPersonalization().inferred }
}

export function personalizationPrompt(state: PersonalizationState): { explicit: ExplicitLearningPreferences; inferred?: PersonalizationState['inferred'] } {
  return { explicit: state.explicit, ...(state.explicit.inferenceEnabled ? { inferred: state.inferred } : {}) }
}
