import { describe, expect, it } from 'vitest'
import { autosaveCandidates, dirtyDocuments } from './editingPolicy'

const documents = [
  { path: '/repo/clean.ts', content: 'a', savedContent: 'a' },
  { path: '/repo/dirty.ts', content: 'b', savedContent: 'a' },
  { path: '/repo/proposal.ts', content: 'c', savedContent: 'a' }
]

describe('editing policy', () => {
  it('identifies dirty files for close protection', () => {
    expect(dirtyDocuments(documents).map((document) => document.path)).toEqual(['/repo/dirty.ts', '/repo/proposal.ts'])
  })

  it('never autosaves unresolved proposal files', () => {
    expect(autosaveCandidates(documents, new Set(['/repo/proposal.ts'])).map((document) => document.path)).toEqual(['/repo/dirty.ts'])
  })
})
