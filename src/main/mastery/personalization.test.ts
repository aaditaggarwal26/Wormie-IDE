import { describe, expect, it } from 'vitest'
import { createDefaultPersonalization, inferPreference, personalizationPrompt, resetInferredPreferences, updateExplicitPreferences } from './personalization'

describe('personalization', () => {
  it('keeps explicit preferences separate from disableable inferred signals', () => {
    const initial = createDefaultPersonalization()
    const explicit = updateExplicitPreferences(initial, { teachingStyle: 'visual', lessonVerbosity: 'concise', inferenceEnabled: false })
    const inferred = inferPreference(explicit, { conceptId: 'ipc.validation', format: 'short_answer', score: 0, misconception: 'Trusting renderer input' }, '2026-07-19T12:00:00.000Z')
    expect(inferred.explicit.teachingStyle).toBe('visual')
    expect(inferred.inferred).toEqual(explicit.inferred)
    expect(personalizationPrompt(inferred).inferred).toBeUndefined()
    expect(resetInferredPreferences(inferred).explicit).toEqual(inferred.explicit)
  })
})
