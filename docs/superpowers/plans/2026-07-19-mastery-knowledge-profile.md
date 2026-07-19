# Mastery and Knowledge Profile Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a persistent, canonical, evidence-based mastery profile that unifies every learning path, schedules reviews, powers personalization and gamification, renders an explainable profile/dashboard, and safely synchronizes approved metadata to accounts and classrooms.

**Architecture:** Electron's main process owns a focused mastery domain and a versioned repository adapter over the existing `electron-store`. Both quiz gates emit canonical question-level evidence into one service; the renderer consumes sanitized React Query projections through narrow validated IPC, while Supabase receives only an idempotent sync-safe projection protected by RLS.

**Tech Stack:** TypeScript 7, Electron 43, React 19, Zustand, React Query, Zod 4, electron-store, Supabase, Vitest, CSS.

## Global Constraints

- Preserve the main-process invariant: “Understand first. Generate second.”
- Preserve both existing gates and their distinct unlock purposes.
- Keep context isolation enabled and renderer Node integration disabled.
- Do not expose answer keys, rubrics, prompts, source code, secrets, filenames, or private workspace paths through IPC or sync.
- Do not add SQLite or another dependency; use a repository abstraction until a database layer exists.
- Use deterministic pure functions and injected clocks for mastery, review, reward, and streak calculations.
- Record no mastery or rewards for bypassed gates or duplicate evidence.
- Keep existing history and migrate legacy mastery without data loss.
- Do not fabricate dashboard or growth data for an empty/insufficient profile.
- Completion requires `npm test`, `npm run typecheck`, and `npm run build` to pass.

---

### Task 1: Fix the existing Windows file-identity baseline failure

**Files:**
- Modify: `src/main/assignments/storage.ts`
- Test: `src/main/assignments/storage.test.ts`

**Interfaces:**
- Consumes: Node `fs.Stats<bigint>` values returned by handle and path stat calls.
- Produces: `isSameFile(left, right): boolean` that compares stable file identity without rejecting the same Windows file because timestamp precision differs.

- [ ] **Step 1: Add a failing regression test** that creates one file, compares handle/path stats through the exported or extracted identity helper, and expects the same file to match while two files do not.

```ts
it('treats handle and path stats for the same Windows file as one identity', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-identity-'))
  const first = path.join(directory, 'first.json')
  const second = path.join(directory, 'second.json')
  await fs.writeFile(first, '{}')
  await fs.writeFile(second, '{}')
  const handle = await fs.open(first, 'r')
  try {
    expect(isSameFile(await handle.stat({ bigint: true }), await fs.stat(first, { bigint: true }))).toBe(true)
    expect(isSameFile(await handle.stat({ bigint: true }), await fs.stat(second, { bigint: true }))).toBe(false)
  } finally { await handle.close() }
})
```

- [ ] **Step 2: Verify RED** with `npm test -- src/main/assignments/storage.test.ts`; expect the same-file assertion or current assignment save tests to fail.
- [ ] **Step 3: Implement the minimal platform-safe comparison** using device/inode as primary identity and size plus normalized timestamp granularity only for mutation checks; do not weaken symlink/TOCTOU protections.
- [ ] **Step 4: Verify GREEN** with `npm test -- src/main/assignments/storage.test.ts src/main/assignments/progress.test.ts src/main/assignments/package.test.ts src/main/assignments/submission.test.ts`; expect all assignment tests to pass.
- [ ] **Step 5: Commit** with `git add src/main/assignments/storage.ts src/main/assignments/storage.test.ts && git commit -m "fix: normalize Windows assignment file identity"`.

### Task 2: Add canonical contracts, taxonomy, and graph

**Files:**
- Modify: `src/shared/contracts.ts`
- Create: `src/main/mastery/catalog.ts`
- Create: `src/main/mastery/catalog.test.ts`
- Create: `src/main/mastery/graph.ts`
- Create: `src/main/mastery/graph.test.ts`

**Interfaces:**
- Produces: `ConceptDefinition`, `ConceptDomain`, `ConceptDepth`, `MasteryStatus`, `resolveConcept(term)`, `registerCustomConcept(term)`, `validateCatalog(catalog)`, and `KnowledgeGraph` methods `prerequisites`, `ancestors`, `dependents`, `depth`, and `blockingPrerequisites`.

- [ ] **Step 1: Write failing catalog tests** for all 23 standard domains, stable aliases, unknown custom concepts, duplicate IDs, ambiguous aliases, and missing prerequisites.

```ts
expect(new Set(canonicalConcepts.map((concept) => concept.domain))).toEqual(new Set(STANDARD_DOMAINS))
expect(resolveConcept('Node.js')?.id).toBe('node.runtime')
expect(resolveConcept('context isolation')?.id).toBe('electron.security.context-isolation')
expect(registerCustomConcept('Vector clocks').id).toBe(registerCustomConcept('vector-clocks').id)
expect(() => validateCatalog([...canonicalConcepts, canonicalConcepts[0]])).toThrow(/duplicate/i)
```

- [ ] **Step 2: Verify RED** with `npm test -- src/main/mastery/catalog.test.ts`; expect module resolution failure.
- [ ] **Step 3: Implement the versioned catalog** with at least one meaningful foundation and one applied sub-concept per standard domain, deterministic normalization, alias index validation, and hash-based custom IDs.
- [ ] **Step 4: Verify catalog GREEN** and confirm deterministic ordering.
- [ ] **Step 5: Write failing graph tests** for direct/transitive prerequisites, ancestors, dependents, depth, thresholds, missing nodes, and cycles.

```ts
const graph = new KnowledgeGraph(canonicalConcepts)
expect(graph.ancestors('electron.security.context-isolation')).toContain('javascript.runtime.execution')
expect(() => new KnowledgeGraph([{ ...fixture, prerequisiteIds: ['missing'] }])).toThrow(/missing/i)
expect(() => new KnowledgeGraph(cycleFixture)).toThrow(/cycle/i)
```

- [ ] **Step 6: Verify graph RED**, implement deterministic DFS/topological validation and traversal with visited sets, then verify GREEN.
- [ ] **Step 7: Commit** with `git add src/shared/contracts.ts src/main/mastery/catalog.ts src/main/mastery/catalog.test.ts src/main/mastery/graph.ts src/main/mastery/graph.test.ts && git commit -m "feat: add canonical mastery taxonomy and graph"`.

### Task 3: Implement evidence, mastery, persistence, and migration

**Files:**
- Modify: `src/shared/contracts.ts`
- Create: `src/main/mastery/model.ts`
- Create: `src/main/mastery/model.test.ts`
- Create: `src/main/mastery/migrations.ts`
- Create: `src/main/mastery/migrations.test.ts`
- Create: `src/main/mastery/repository.ts`
- Create: `src/main/mastery/repository.test.ts`
- Modify: `src/main/index.ts`

**Interfaces:**
- Produces: `MasteryEvidence`, `ConceptMastery`, `MasteryState`, `applyEvidence(profile, evidence, now)`, `projectConcept(profile, conceptId, now)`, `migrateMasteryState(raw, legacy, now)`, and `MasteryRepository`.

- [ ] **Step 1: Write failing model tests** for unassessed state, correct/incorrect and partial evidence, difficulty/format weighting, multiple-choice guessing risk, deduplication, repeated attempts, confidence diversity, critical misconception caps, decay, and score explanations.

```ts
expect(projectConcept(emptyProfile(), 'javascript.closures', NOW).status).toBe('unassessed')
const once = applyEvidence(emptyProfile(), evidence({ id: 'e1', score: 1 }), NOW)
expect(applyEvidence(once, evidence({ id: 'e1', score: 1 }), NOW)).toEqual(once)
expect(projectConcept(once, 'javascript.closures', NOW).confidence).toBeGreaterThan(0)
expect(projectConcept(once, 'javascript.closures', LATER).confidence).toBeLessThan(projectConcept(once, 'javascript.closures', NOW).confidence)
```

- [ ] **Step 2: Verify model RED**, implement immutable evidence indexing and pure projection formulas documented in `model.ts`, then verify GREEN.
- [ ] **Step 3: Write failing migration/repository tests** that import legacy mastery, preserve quiz IDs, normalize corrupt records, persist updates, cap collections, and restore after restart.
- [ ] **Step 4: Verify RED**, implement schema version 1 state, Zod restoration, per-record normalization, and the electron-store adapter, then verify GREEN.
- [ ] **Step 5: Wire one device-wide `mastery-state` store in `src/main/index.ts`** without changing understanding-store ownership.
- [ ] **Step 6: Run `npm test -- src/main/mastery` and `npm run typecheck`**; expect pass.
- [ ] **Step 7: Commit** with `git add src/shared/contracts.ts src/main/mastery src/main/index.ts && git commit -m "feat: add evidence-based mastery persistence"`.

### Task 4: Unify both quiz paths and prerequisite planning

**Files:**
- Modify: `src/shared/contracts.ts`
- Modify: `src/main/agent/schemas.ts`
- Modify: `src/main/agent/index.ts`
- Modify: `src/main/agent/grading.ts`
- Create: `src/main/agent/masteryIntegration.test.ts`
- Modify: `src/main/understanding/index.ts`
- Modify: `src/main/understanding/gate.ts`
- Modify: `src/main/understanding/gate.test.ts`
- Modify: `src/main/understanding/prompts.ts`
- Create: `src/main/mastery/service.ts`
- Create: `src/main/mastery/service.test.ts`

**Interfaces:**
- Consumes: canonical catalog/graph, `MasteryRepository`, private main-process grading.
- Produces: `MasteryService.recordAssessment(input)`, `MasteryService.learningPlan(conceptIds, now)`, and canonical `conceptId`, `difficulty`, and `format` on every learning question.

- [ ] **Step 1: Write failing service and integration tests** proving canonical resolution, weak transitive prerequisite insertion, diagnostic test-out for unassessed users, question-level evidence from the prerequisite quiz, evidence from the change quiz, repeated-attempt deduplication, and bypass no-op behavior.

```ts
await service.recordAssessment({ source: 'prerequisite_quiz', assessmentId: 's1', attempt: 1, answers: [answer('q1', 'ipc.validation', 1)] })
await service.recordAssessment({ source: 'prerequisite_quiz', assessmentId: 's1', attempt: 1, answers: [answer('q1', 'ipc.validation', 1)] })
expect(repository.read().evidence).toHaveLength(1)
expect(service.learningPlan(['electron.ipc'], NOW).blockingConceptIds).toContain('ipc.validation')
```

- [ ] **Step 2: Verify RED**, implement the orchestration service and canonical mapping, then verify GREEN.
- [ ] **Step 3: Update AI schemas/prompts** so learning concepts/questions request canonical IDs and the prompt includes allowed concepts plus sanitized profile signals; validate or safely custom-map provider output.
- [ ] **Step 4: Route `agentSubmitQuiz` through `MasteryService`** after grading while retaining its existing passing threshold/session gate.
- [ ] **Step 5: Route `UnderstandingGateService.submit` through `MasteryService`** after complete grading while retaining fingerprint, critical-question, retry, remediation, and bypass behavior.
- [ ] **Step 6: Replace legacy moving-average mutation** with imported/read-only compatibility projection and invalidate no gate state.
- [ ] **Step 7: Run focused tests and typecheck**, then commit with `git commit -m "feat: unify mastery evidence across learning gates"`.

### Task 5: Add reviews, misconceptions, personalization, goals, and gamification

**Files:**
- Modify: `src/shared/contracts.ts`
- Create: `src/main/mastery/reviews.ts`
- Create: `src/main/mastery/reviews.test.ts`
- Create: `src/main/mastery/misconceptions.ts`
- Create: `src/main/mastery/misconceptions.test.ts`
- Create: `src/main/mastery/personalization.ts`
- Create: `src/main/mastery/personalization.test.ts`
- Create: `src/main/mastery/goals.ts`
- Create: `src/main/mastery/goals.test.ts`
- Create: `src/main/mastery/gamification.ts`
- Create: `src/main/mastery/gamification.test.ts`
- Modify: `src/main/mastery/service.ts`

**Interfaces:**
- Produces: `scheduleReview(state, outcome, clock)`, `forgottenRisk`, misconception transitions, explicit/inferred preferences, goal mutations, and `applyRewardRules(state, event, clock)`.

- [ ] **Step 1: Write review tests** for first interval, confidence adjustment, success growth, failure lapse/reset, overdue risk, and injected-clock determinism; implement and verify.
- [ ] **Step 2: Write misconception tests** for creation, recurrence, remediation, independent resolution, and critical caps; implement and verify.
- [ ] **Step 3: Write personalization tests** proving explicit/inferred separation, disabled inference, bounded prompt projection, and reset; implement and verify.
- [ ] **Step 4: Write goal/reward tests** for bounded goals, XP idempotency, no bypass rewards, difficulty scaling, perfect scores, reviews, misconception resolution, levels, daily/weekly streaks, badges, achievements, and reasons/timestamps; implement and verify.
- [ ] **Step 5: Integrate accepted evidence transactionally** so evidence, review, misconception, goal, and reward mutations share one repository update.
- [ ] **Step 6: Run `npm test -- src/main/mastery` and typecheck**, then commit with `git commit -m "feat: add reviews personalization and learning rewards"`.

### Task 6: Add secure IPC and profile projections

**Files:**
- Modify: `src/shared/contracts.ts`
- Create: `src/main/mastery/ipc.ts`
- Create: `src/main/mastery/ipc.test.ts`
- Modify: `src/main/mastery/service.ts`
- Modify: `src/main/index.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/ipcTrust.test.ts`

**Interfaces:**
- Produces: `getMasteryOverview`, `getDomainSummaries`, `getConceptDetail`, `getEvidencePage`, `getMisconceptions`, `getReviews`, `startReview`, `submitReview`, `get/save/resetPersonalization`, `get/create/update/deleteGoals`, `getGamification`, and `getMasterySyncStatus`.

- [ ] **Step 1: Write failing IPC tests** for trusted sender enforcement, bounded pagination, concept/goal ID validation, maximum string lengths, sanitized view models, and absence of answer/rubric/prompt/path fields.
- [ ] **Step 2: Verify RED**, implement Zod request schemas and sanitized projection methods, then verify GREEN.
- [ ] **Step 3: Add exact IPC channel constants, `DesktopApi` signatures, and preload invokes** with no generic storage access.
- [ ] **Step 4: Register handlers using the existing renderer URL trust predicate** and test untrusted senders.
- [ ] **Step 5: Run IPC tests and typecheck**, then commit with `git commit -m "feat: expose secure mastery profile IPC"`.

### Task 7: Build the Knowledge Profile and mastery dashboard

**Files:**
- Modify: `src/renderer/src/App.tsx`
- Modify: `src/renderer/src/components/ActivityRail.tsx`
- Replace: `src/renderer/src/components/QuizHistory.tsx`
- Create: `src/renderer/src/components/mastery/KnowledgeProfile.tsx`
- Create: `src/renderer/src/components/mastery/MasteryOverview.tsx`
- Create: `src/renderer/src/components/mastery/DomainMastery.tsx`
- Create: `src/renderer/src/components/mastery/MasteryHeatmap.tsx`
- Create: `src/renderer/src/components/mastery/ConceptDetail.tsx`
- Create: `src/renderer/src/components/mastery/EvidenceTimeline.tsx`
- Create: `src/renderer/src/components/mastery/ReviewQueue.tsx`
- Create: `src/renderer/src/components/mastery/MisconceptionList.tsx`
- Create: `src/renderer/src/components/mastery/GoalsPanel.tsx`
- Create: `src/renderer/src/components/mastery/AchievementPanel.tsx`
- Create: `src/renderer/src/components/mastery/profileModel.ts`
- Create: `src/renderer/src/components/mastery/profileModel.test.ts`
- Create: `src/renderer/src/hooks/useMasteryProfile.ts`
- Create: `src/renderer/src/hooks/masteryQueryKeys.ts`
- Create: `src/renderer/src/hooks/masteryQueryKeys.test.ts`
- Modify: `src/renderer/src/components/TutorPane.tsx`
- Modify: `src/renderer/src/components/UnderstandingQuiz.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: sanitized mastery IPC view models and React Query.
- Produces: full Knowledge Profile, concept detail navigation, dashboard projections, working review/test-out/goal actions, and shared invalidation after all learning mutations.

- [ ] **Step 1: Write failing profile-model tests** for filtering/sorting, honest empty states, confidence-aware overall score, heatmap cells, improvement/regression, insufficient growth evidence, and accessible text summaries.
- [ ] **Step 2: Verify RED**, implement pure renderer models, then verify GREEN.
- [ ] **Step 3: Write failing query-key tests** proving quiz/review/goal/sync mutation helpers invalidate overview, domains, details, reviews, goals, and gamification.
- [ ] **Step 4: Implement React Query hooks** with loading/error/empty states and event-driven invalidation; remove one-time mastery fetching.
- [ ] **Step 5: Implement focused UI components** with keyboard controls, `aria-*`, text chart equivalents, responsive layout, and reduced-motion-safe CSS.
- [ ] **Step 6: Wire Knowledge activity, compact summary, concept detail, review/test-out, goals, and post-quiz refresh** without unrelated workbench redesign.
- [ ] **Step 7: Run renderer tests and typecheck**, then commit with `git commit -m "feat: build knowledge profile and mastery dashboard"`.

### Task 8: Implement account sync and authorized classroom mastery

**Files:**
- Modify: `src/shared/contracts.ts`
- Create: `src/main/mastery/sync.ts`
- Create: `src/main/mastery/sync.test.ts`
- Modify: `src/main/mastery/repository.ts`
- Modify: `src/main/cloud/index.ts`
- Create: `src/main/cloud/masterySync.test.ts`
- Create: `supabase/migrations/202607190001_mastery_profiles.sql`
- Create: `supabase/migrations/202607190002_mastery_rls_hardening.sql`
- Create: `supabase/migrations/mastery_policies.test.ts`
- Modify: `src/renderer/src/components/ClassroomPanel.tsx`
- Create: `src/renderer/src/components/mastery/TeacherMasterySummary.tsx`

**Interfaces:**
- Produces: deterministic sync-safe records, outbox retry/status, conflict merge, authenticated push/pull, teacher student/domain/cohort summary RPCs, and insufficient-evidence states.

- [ ] **Step 1: Write failing sync tests** for event union, aggregate recomputation, goal version conflicts, review outcome ordering, retry/backoff, offline persistence, idempotent replay, account switch isolation, and sensitive-field exclusion.
- [ ] **Step 2: Verify RED**, implement pure serialization/merge plus repository outbox, then verify GREEN.
- [ ] **Step 3: Write policy coverage tests** that inspect migrations for RLS enablement, self-only student access, authorized-teacher RPC checks, fixed search paths, grants, and revoked public execution.
- [ ] **Step 4: Add migrations** for summaries, evidence metadata, review state, goals, achievements, mutation ledger, indexes, RLS, helper functions, teacher RPCs, and cohort insufficient-evidence counts.
- [ ] **Step 5: Add trusted cloud handlers** for sync/status and teacher summaries; validate Supabase rows before merging and keep signed-out/offline behavior local-first.
- [ ] **Step 6: Render teacher summaries** only for teacher classrooms and never expose raw private evidence.
- [ ] **Step 7: Run mastery/cloud/policy tests and typecheck**, then commit with `git commit -m "feat: sync mastery and add teacher summaries"`.

### Task 9: Full verification, privacy audit, and cleanup

**Files:**
- Modify only files implicated by failures or audit findings.
- Verify: all new and existing tests, production bundles, migrations, and git diff.

**Interfaces:**
- Produces: a clean, passing, production-ready implementation with exact verification evidence.

- [ ] **Step 1: Run `rg -n "TODO|TBD|placeholder|mock mastery|fake data" src supabase docs/superpowers/specs/2026-07-19-mastery-knowledge-profile-design.md`** and remove any implementation placeholder or fake profile data.
- [ ] **Step 2: Run privacy searches** for sync/IPC serializers containing `answer`, `rubric`, `prompt`, `content`, `path`, `secret`, or provider context; add a failing regression test for any leak before fixing it.
- [ ] **Step 3: Run `npm test`**; expected: every test file and test passes.
- [ ] **Step 4: Run `npm run typecheck`**; expected exit code 0 with no TypeScript diagnostics.
- [ ] **Step 5: Run `npm run build` outside the restricted filesystem sandbox if required**; expected Electron Vite main, preload, and renderer bundles all succeed.
- [ ] **Step 6: Run `git diff --check` and inspect `git status --short`**; expected no whitespace errors and only intentional changes.
- [ ] **Step 7: Commit final fixes** with `git commit -m "test: verify production mastery system"` when verification required additional changes.
