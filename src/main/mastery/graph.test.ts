import { describe, expect, it } from 'vitest'
import type { ConceptDefinition, ConceptMasterySummary } from '../../shared/contracts'
import { canonicalConcepts } from './catalog'
import { KnowledgeGraph } from './graph'

describe('KnowledgeGraph', () => {
  it('traverses direct and transitive prerequisites and dependents deterministically', () => {
    const graph = new KnowledgeGraph(canonicalConcepts)
    expect(graph.prerequisites('electron.security.context-isolation')).toContain('electron.process-model')
    expect(graph.ancestors('electron.security.context-isolation')).toContain('javascript.runtime.execution')
    expect(graph.dependents('javascript.runtime.execution')).toContain('electron.process-model')
    expect(graph.depth('electron.security.context-isolation')).toBeGreaterThan(1)
    expect(graph.ancestors('electron.security.context-isolation')).toEqual([...graph.ancestors('electron.security.context-isolation')].sort())
  })

  it('finds blocking weak prerequisites but lets unassessed users take diagnostics', () => {
    const graph = new KnowledgeGraph(canonicalConcepts)
    const mastery = new Map<string, ConceptMasterySummary>([
      ['javascript.runtime.execution', { conceptId: 'javascript.runtime.execution', mastery: 82, confidence: 0.8, status: 'proficient' }],
      ['electron.process-model', { conceptId: 'electron.process-model', mastery: 42, confidence: 0.7, status: 'weak' }]
    ])
    const result = graph.blockingPrerequisites('electron.security.context-isolation', mastery)
    expect(result.blocking).toContain('electron.process-model')
    expect(result.diagnostic).not.toContain('electron.process-model')
    expect(result.diagnostic).toContain('security.input-validation')
  })

  it('rejects cycles and missing nodes', () => {
    const base = (id: string, prerequisiteIds: string[]): ConceptDefinition => ({
      id, name: id, description: id, domain: 'custom', depth: 'foundation', prerequisiteIds,
      requiredMastery: 60, aliases: [], active: true, deprecated: false, version: 1
    })
    expect(() => new KnowledgeGraph([base('a', ['missing'])])).toThrow(/missing prerequisite/i)
    expect(() => new KnowledgeGraph([base('a', ['b']), base('b', ['a'])])).toThrow(/cycle/i)
  })
})
