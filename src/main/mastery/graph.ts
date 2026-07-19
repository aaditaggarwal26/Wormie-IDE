import type { ConceptDefinition, ConceptMasterySummary } from '../../shared/contracts'
import { validateCatalog } from './catalog'

export class KnowledgeGraph {
  private readonly nodes: Map<string, ConceptDefinition>
  private readonly children = new Map<string, string[]>()

  constructor(concepts: readonly ConceptDefinition[]) {
    validateCatalog(concepts)
    this.nodes = new Map(concepts.map((concept) => [concept.id, concept]))
    for (const concept of concepts) {
      for (const prerequisiteId of concept.prerequisiteIds) {
        this.children.set(prerequisiteId, [...(this.children.get(prerequisiteId) ?? []), concept.id].sort())
      }
    }
    this.assertAcyclic()
  }

  get(id: string): ConceptDefinition | null { return this.nodes.get(id) ?? null }

  prerequisites(id: string): string[] {
    return [...this.requireNode(id).prerequisiteIds].sort()
  }

  ancestors(id: string): string[] {
    const found = new Set<string>()
    const visit = (current: string) => {
      for (const prerequisite of this.requireNode(current).prerequisiteIds) {
        if (found.has(prerequisite)) continue
        found.add(prerequisite)
        visit(prerequisite)
      }
    }
    visit(id)
    return [...found].sort()
  }

  dependents(id: string): string[] {
    this.requireNode(id)
    const found = new Set<string>()
    const visit = (current: string) => {
      for (const child of this.children.get(current) ?? []) {
        if (found.has(child)) continue
        found.add(child)
        visit(child)
      }
    }
    visit(id)
    return [...found].sort()
  }

  depth(id: string): number {
    const memo = new Map<string, number>()
    const calculate = (current: string): number => {
      const cached = memo.get(current)
      if (cached !== undefined) return cached
      const prerequisites = this.requireNode(current).prerequisiteIds
      const value = prerequisites.length === 0 ? 0 : 1 + Math.max(...prerequisites.map(calculate))
      memo.set(current, value)
      return value
    }
    return calculate(id)
  }

  blockingPrerequisites(id: string, mastery: ReadonlyMap<string, ConceptMasterySummary>): { blocking: string[]; diagnostic: string[] } {
    const blocking: string[] = []
    const diagnostic: string[] = []
    for (const ancestorId of this.ancestors(id)) {
      const concept = this.requireNode(ancestorId)
      const summary = mastery.get(ancestorId)
      if (!summary || summary.status === 'unassessed' || summary.confidence < 0.35) diagnostic.push(ancestorId)
      else if (summary.mastery < concept.requiredMastery || ['learning', 'weak'].includes(summary.status)) blocking.push(ancestorId)
    }
    return { blocking: blocking.sort(), diagnostic: diagnostic.sort() }
  }

  private requireNode(id: string): ConceptDefinition {
    const node = this.nodes.get(id)
    if (!node) throw new Error(`Unknown concept: ${id}`)
    return node
  }

  private assertAcyclic(): void {
    const visiting = new Set<string>()
    const visited = new Set<string>()
    const visit = (id: string) => {
      if (visiting.has(id)) throw new Error(`Knowledge graph cycle detected at ${id}`)
      if (visited.has(id)) return
      visiting.add(id)
      for (const prerequisite of this.requireNode(id).prerequisiteIds) visit(prerequisite)
      visiting.delete(id)
      visited.add(id)
    }
    for (const id of [...this.nodes.keys()].sort()) visit(id)
  }
}
