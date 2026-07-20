import { createHash } from 'node:crypto'
import type { ConceptDefinition, ConceptDepth, ConceptDomain } from '../../shared/contracts'

export const CATALOG_VERSION = 1
export const STANDARD_DOMAINS = [
  'javascript', 'typescript', 'react', 'node', 'electron', 'express', 'nextjs', 'sql', 'nosql',
  'authentication', 'algorithms', 'data-structures', 'networking', 'concurrency', 'testing', 'git',
  'docker', 'system-design', 'electron-apis', 'ipc', 'filesystems', 'security', 'memory-management'
] as const satisfies readonly ConceptDomain[]

function concept(
  id: string,
  name: string,
  description: string,
  domain: ConceptDomain,
  depth: ConceptDepth,
  prerequisiteIds: string[] = [],
  aliases: string[] = [],
  requiredMastery = 60
): ConceptDefinition {
  return { id, name, description, domain, depth, prerequisiteIds, requiredMastery, aliases, active: true, deprecated: false, version: CATALOG_VERSION }
}

export const canonicalConcepts: ConceptDefinition[] = [
  concept('javascript.runtime.execution', 'JavaScript execution', 'Values, scope, calls, and runtime execution order.', 'javascript', 'foundation', [], ['javascript basics', 'js runtime']),
  concept('javascript.functions-closures', 'Functions and closures', 'Functions, lexical scope, callbacks, and captured state.', 'javascript', 'intermediate', ['javascript.runtime.execution'], ['closures', 'javascript functions']),
  concept('typescript.type-system', 'TypeScript type system', 'Static types, narrowing, inference, and structural compatibility.', 'typescript', 'foundation', ['javascript.runtime.execution'], ['typescript', 'ts types']),
  concept('typescript.generics', 'TypeScript generics', 'Reusable type parameters, constraints, and safe abstraction.', 'typescript', 'advanced', ['typescript.type-system'], ['generics', 'generic types']),
  concept('react.components-state', 'React components and state', 'Component composition, props, state, and render flow.', 'react', 'foundation', ['javascript.functions-closures'], ['react state', 'react components']),
  concept('react.effects', 'React effects', 'Synchronizing components with external systems and effect lifecycles.', 'react', 'intermediate', ['react.components-state'], ['useeffect', 'react hooks effects']),
  concept('node.runtime', 'Node.js runtime', 'Server-side JavaScript modules, processes, and runtime APIs.', 'node', 'foundation', ['javascript.runtime.execution'], ['node', 'node.js', 'nodejs']),
  concept('node.event-loop', 'Node.js event loop', 'Tasks, microtasks, asynchronous I/O, and event-loop behavior.', 'node', 'intermediate', ['node.runtime', 'javascript.functions-closures'], ['event loop', 'node async']),
  concept('electron.process-model', 'Electron process model', 'Main, renderer, and preload responsibilities and boundaries.', 'electron', 'foundation', ['node.runtime', 'javascript.runtime.execution'], ['electron architecture', 'main renderer preload']),
  concept('electron.security.context-isolation', 'Electron context isolation', 'Isolated renderer worlds, safe preload bridges, and disabled Node integration.', 'electron', 'advanced', ['electron.process-model', 'security.input-validation'], ['context isolation', 'electron security']),
  concept('express.routing-middleware', 'Express routing and middleware', 'Request routing, middleware ordering, and response flow.', 'express', 'foundation', ['node.runtime'], ['express middleware', 'express routing']),
  concept('express.error-handling', 'Express error handling', 'Error middleware, async failures, and safe HTTP responses.', 'express', 'intermediate', ['express.routing-middleware'], ['express errors']),
  concept('nextjs.app-router', 'Next.js App Router', 'Layouts, routes, server rendering, and App Router conventions.', 'nextjs', 'foundation', ['react.components-state', 'node.runtime'], ['next.js', 'nextjs', 'app router']),
  concept('nextjs.server-client-boundaries', 'Next.js server/client boundaries', 'Server Components, client islands, serialization, and data flow.', 'nextjs', 'advanced', ['nextjs.app-router'], ['server components', 'use client']),
  concept('sql.relational-model', 'SQL relational model', 'Tables, keys, relationships, constraints, and queries.', 'sql', 'foundation', [], ['relational databases', 'sql basics']),
  concept('sql.transactions', 'SQL transactions', 'Atomicity, isolation, consistency, locking, and rollback.', 'sql', 'advanced', ['sql.relational-model', 'concurrency.synchronization'], ['database transactions', 'acid']),
  concept('nosql.document-model', 'NoSQL document model', 'Documents, denormalization, keys, and access-driven modeling.', 'nosql', 'foundation', [], ['document database', 'mongodb']),
  concept('nosql.consistency', 'NoSQL consistency', 'Replication, consistency trade-offs, and conflict handling.', 'nosql', 'advanced', ['nosql.document-model', 'networking.protocols'], ['eventual consistency', 'cap theorem']),
  concept('authentication.sessions', 'Session authentication', 'Server-owned sessions, cookies, expiry, and authorization context.', 'authentication', 'foundation', ['networking.http', 'security.input-validation'], ['sessions', 'cookies auth']),
  concept('authentication.tokens', 'Token authentication', 'Signed tokens, claims, expiry, rotation, and verification.', 'authentication', 'intermediate', ['security.cryptography', 'networking.http'], ['jwt', 'jwts', 'bearer tokens']),
  concept('algorithms.complexity', 'Algorithmic complexity', 'Time and space growth, trade-offs, and input scale.', 'algorithms', 'foundation', [], ['big o', 'complexity']),
  concept('algorithms.search-sort', 'Searching and sorting', 'Core search/sort strategies, invariants, and complexity.', 'algorithms', 'intermediate', ['algorithms.complexity'], ['binary search', 'sorting algorithms']),
  concept('data-structures.collections', 'Core data structures', 'Arrays, lists, stacks, queues, maps, and sets.', 'data-structures', 'foundation', [], ['collections', 'arrays and maps']),
  concept('data-structures.trees-graphs', 'Trees and graphs', 'Hierarchical and network structures, traversal, and representation.', 'data-structures', 'intermediate', ['data-structures.collections', 'algorithms.complexity'], ['trees', 'graphs']),
  concept('networking.http', 'HTTP fundamentals', 'Requests, responses, methods, status codes, headers, and caching.', 'networking', 'foundation', [], ['http', 'web requests']),
  concept('networking.protocols', 'Network protocols', 'Transport, addressing, reliability, latency, and protocol boundaries.', 'networking', 'intermediate', ['networking.http'], ['tcp ip', 'network protocols']),
  concept('concurrency.async-model', 'Asynchronous execution', 'Promises, tasks, cancellation, ordering, and shared state.', 'concurrency', 'foundation', ['javascript.runtime.execution'], ['async await', 'asynchrony']),
  concept('concurrency.synchronization', 'Concurrency synchronization', 'Locks, queues, atomic operations, and race prevention.', 'concurrency', 'advanced', ['concurrency.async-model'], ['race conditions', 'mutex']),
  concept('testing.fundamentals', 'Testing fundamentals', 'Test boundaries, assertions, fixtures, and deterministic behavior.', 'testing', 'foundation', [], ['unit testing', 'tests']),
  concept('testing.integration', 'Integration testing', 'Testing real component boundaries, contracts, and failure paths.', 'testing', 'intermediate', ['testing.fundamentals'], ['integration tests', 'end to end testing']),
  concept('git.fundamentals', 'Git fundamentals', 'Snapshots, working trees, staging, commits, and history.', 'git', 'foundation', [], ['version control', 'git basics']),
  concept('git.branching', 'Git branching and merging', 'Branches, merges, rebases, conflicts, and collaboration.', 'git', 'intermediate', ['git.fundamentals'], ['git branches', 'merge conflicts']),
  concept('docker.containers', 'Docker containers', 'Images, containers, layers, builds, and runtime isolation.', 'docker', 'foundation', [], ['containers', 'docker basics']),
  concept('docker.networking', 'Docker networking', 'Container networks, ports, DNS, and service communication.', 'docker', 'intermediate', ['docker.containers', 'networking.protocols'], ['container networking']),
  concept('system-design.boundaries', 'System boundaries', 'Components, contracts, ownership, coupling, and cohesion.', 'system-design', 'foundation', [], ['software architecture', 'component design']),
  concept('system-design.scalability', 'Scalable systems', 'Load distribution, caching, partitioning, resilience, and capacity.', 'system-design', 'advanced', ['system-design.boundaries', 'networking.protocols'], ['scalability', 'distributed systems']),
  concept('electron-apis.lifecycle', 'Electron application lifecycle', 'Application readiness, windows, shutdown, and platform lifecycle.', 'electron-apis', 'foundation', ['electron.process-model'], ['electron app api', 'app lifecycle']),
  concept('electron-apis.windows', 'Electron window APIs', 'BrowserWindow ownership, navigation, permissions, and window state.', 'electron-apis', 'intermediate', ['electron-apis.lifecycle'], ['browserwindow', 'electron windows']),
  concept('ipc.messaging', 'IPC messaging', 'Typed request/response and event communication across process boundaries.', 'ipc', 'foundation', ['electron.process-model'], ['ipc', 'electron ipc']),
  concept('ipc.validation', 'IPC validation', 'Narrow channels, trusted senders, bounded inputs, and sanitized outputs.', 'ipc', 'advanced', ['ipc.messaging', 'security.input-validation'], ['ipc security', 'validate ipc']),
  concept('filesystems.paths', 'Filesystem paths', 'Portable paths, canonicalization, traversal, and link behavior.', 'filesystems', 'foundation', [], ['file paths', 'path traversal']),
  concept('filesystems.safe-io', 'Safe filesystem I/O', 'Bounded reads, atomic writes, identity checks, and recovery.', 'filesystems', 'advanced', ['filesystems.paths', 'security.input-validation'], ['atomic writes', 'safe file io']),
  concept('security.input-validation', 'Input validation', 'Trust boundaries, schemas, bounds, sanitization, and fail-closed behavior.', 'security', 'foundation', [], ['validation', 'sanitize input']),
  concept('security.cryptography', 'Applied cryptography', 'Hashes, signatures, encryption, keys, and secure randomness.', 'security', 'advanced', ['security.input-validation'], ['cryptography', 'hashing']),
  concept('memory-management.allocation', 'Memory allocation and lifetime', 'Allocation, references, garbage collection, and object lifetime.', 'memory-management', 'foundation', ['javascript.runtime.execution'], ['memory management', 'garbage collection']),
  concept('memory-management.leaks', 'Memory leaks and profiling', 'Retained references, resource cleanup, profiling, and pressure.', 'memory-management', 'advanced', ['memory-management.allocation'], ['memory leaks', 'heap profiling'])
]

export function normalizeConceptTerm(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ')
}

export function validateCatalog(catalog: readonly ConceptDefinition[]): void {
  const ids = new Set<string>()
  const aliases = new Map<string, string>()
  for (const item of catalog) {
    if (ids.has(item.id)) throw new Error(`Duplicate concept ID: ${item.id}`)
    ids.add(item.id)
    for (const term of [item.id, item.name, ...item.aliases]) {
      const normalized = normalizeConceptTerm(term)
      const owner = aliases.get(normalized)
      if (owner && owner !== item.id) throw new Error(`Ambiguous concept alias: ${term}`)
      aliases.set(normalized, item.id)
    }
  }
  for (const item of catalog) {
    for (const prerequisiteId of item.prerequisiteIds) {
      if (!ids.has(prerequisiteId)) throw new Error(`Missing prerequisite ${prerequisiteId} for ${item.id}`)
    }
  }
}

validateCatalog(canonicalConcepts)
const canonicalById = new Map(canonicalConcepts.map((item) => [item.id, item]))
const aliasIndex = new Map<string, ConceptDefinition>()
for (const item of canonicalConcepts) {
  for (const term of [item.id, item.name, ...item.aliases]) aliasIndex.set(normalizeConceptTerm(term), item)
}

export function resolveConcept(term: string): ConceptDefinition | null {
  const exact = canonicalById.get(term.trim().toLowerCase())
  return exact ?? aliasIndex.get(normalizeConceptTerm(term)) ?? null
}

export function registerCustomConcept(term: string): ConceptDefinition {
  const normalized = normalizeConceptTerm(term) || 'unnamed concept'
  const id = `custom.${createHash('sha256').update(normalized).digest('hex').slice(0, 12)}`
  return concept(id, term.trim().slice(0, 100) || 'Custom concept', 'A locally registered concept not yet present in the bundled taxonomy.', 'custom', 'intermediate', [], [normalized])
}

export function resolveOrRegisterConcept(term: string): ConceptDefinition {
  return resolveConcept(term) ?? registerCustomConcept(term)
}
