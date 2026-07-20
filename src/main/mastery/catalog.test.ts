import { describe, expect, it } from 'vitest'
import { STANDARD_DOMAINS, canonicalConcepts, registerCustomConcept, resolveConcept, validateCatalog } from './catalog'

describe('canonical mastery catalog', () => {
  it('covers every standard programming domain with meaningful sub-concepts', () => {
    const domains = new Set(canonicalConcepts.map((concept) => concept.domain))
    expect(domains).toEqual(new Set(STANDARD_DOMAINS))
    for (const domain of STANDARD_DOMAINS) {
      expect(canonicalConcepts.filter((concept) => concept.domain === domain).length).toBeGreaterThanOrEqual(2)
    }
  })

  it('resolves canonical IDs and deterministic aliases without fragmentation', () => {
    expect(resolveConcept('node.runtime')?.id).toBe('node.runtime')
    expect(resolveConcept('Node.js')?.id).toBe('node.runtime')
    expect(resolveConcept('context isolation')?.id).toBe('electron.security.context-isolation')
    expect(resolveConcept('  JWTs  ')?.id).toBe('authentication.tokens')
  })

  it('registers stable custom concepts for unknown terminology', () => {
    const first = registerCustomConcept('Vector clocks')
    const second = registerCustomConcept('vector-clocks')
    expect(first.id).toBe(second.id)
    expect(first.domain).toBe('custom')
    expect(first.active).toBe(true)
  })

  it('rejects duplicate IDs, ambiguous aliases, and missing prerequisite references', () => {
    expect(() => validateCatalog([...canonicalConcepts, canonicalConcepts[0]])).toThrow(/duplicate concept/i)
    expect(() => validateCatalog([
      { ...canonicalConcepts[0], id: 'custom.one', aliases: ['same alias'], prerequisiteIds: [] },
      { ...canonicalConcepts[1], id: 'custom.two', aliases: ['same-alias'], prerequisiteIds: [] }
    ])).toThrow(/alias/i)
    expect(() => validateCatalog([{ ...canonicalConcepts[0], prerequisiteIds: ['missing.concept'] }])).toThrow(/missing prerequisite/i)
  })
})
