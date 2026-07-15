# Major Change Understanding Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:test-driven-development and execute this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require a persistent, fingerprint-bound understanding check before accepting major AI proposals or creating major staged Git commits.

**Architecture:** A focused Electron-main `understanding` domain supplies deterministic classification, redaction, fingerprinting, persistence, quiz generation, grading, and gate checks. Existing agent and Git handlers call this domain; the preload exposes narrow typed operations; React renders the returned public state without answer keys.

**Tech Stack:** Electron 43, TypeScript, React 19, Zustand, React Query, Zod, simple-git, electron-store, Vitest.

## Global Constraints

- Preserve the main-process security boundary and context isolation.
- Never expose correct answers or grading rubrics to the renderer before submission.
- Fail closed on AI, persistence, stale-diff, and fingerprint errors.
- Reuse the existing visual language, test stack, provider gateway, and persistence library.
- Do not add fake production data, placeholder controls, or a second test framework.

---

### Task 1: Deterministic understanding core

**Files:** Create `src/main/understanding/{significance,fingerprint,redaction,grading}.ts` and matching `*.test.ts`; modify `src/shared/contracts.ts`.

**Interfaces:** Produce `classifyChange(input, settings)`, `fingerprintChange(input)`, `sanitizeChangeContext(input)`, and exact-answer `gradeDeterministicAnswers(...)` functions using shared change/quiz types.

- [ ] Write failing tests for line/file thresholds, dependency/auth/IPC/schema/security risks, threshold settings, stable fingerprint ordering, material invalidation, secret/binary/lockfile redaction, multiple choice/select/boolean/ordering grading, and weighted score calculation.
- [ ] Run the focused tests and confirm failures come from missing modules.
- [ ] Implement the smallest deterministic functions that satisfy the behavior.
- [ ] Run focused tests and refactor only while green.

### Task 2: Durable state and gate lifecycle

**Files:** Create `src/main/understanding/{store,gate}.ts` and tests; modify `src/main/preferences.ts`.

**Interfaces:** Produce a versioned `UnderstandingRepository` and `UnderstandingGateService` that create/restore quizzes, autosave answers, record attempts, issue fingerprint-bound passes, invalidate stale passes, update mastery, and audit bypasses.

- [ ] Write failing tests for defaults, migration, restoration, fail/retry/remediation/pass transitions, invalidation, mastery updates, and bypass policy.
- [ ] Run focused tests and confirm expected failures.
- [ ] Implement storage adapters and pure lifecycle transitions.
- [ ] Run focused tests and refactor while green.

### Task 3: Structured AI quiz pipeline

**Files:** Modify `src/main/agent/{schemas,provider}.ts`; create `src/main/understanding/prompts.ts`; add schema/prompt tests.

**Interfaces:** Add provider operations for grounded understanding-quiz generation and short-answer grading, with strict Zod schemas and renderer-safe question projection.

- [ ] Write failing schema tests for supported question formats, source references, correct option bounds, scenario requirements, and invalid grading responses.
- [ ] Run tests to observe schema failures.
- [ ] Implement separate bounded prompts, schemas, provider summaries, and projection.
- [ ] Run focused tests.

### Task 4: Trusted IPC and AI proposal gate

**Files:** Create `src/main/understanding/index.ts`; modify `src/main/index.ts`, `src/main/agent/index.ts`, `src/preload/index.ts`, and `src/shared/contracts.ts`; add integration tests around extracted gate helpers.

**Interfaces:** Expose get/start/save/submit/retry/bypass/history/settings APIs. Proposal generation attaches significance and a change ID; proposal apply recomputes its fingerprint and requires the exact pass when configured.

- [ ] Write failing tests for major proposal trigger, minor bypass under defaults, pass unlock, failed lock, and changed-content invalidation.
- [ ] Run focused tests.
- [ ] Implement service registration and agent integration.
- [ ] Run focused tests and typecheck.

### Task 5: Staged Git analysis and commit gate

**Files:** Modify `src/main/git.ts`, `src/preload/index.ts`, and contracts; add `src/main/gitUnderstanding.test.ts`.

**Interfaces:** Add `analyzeStagedChange(repositoryRoot)`, `commitStagedChange({repositoryRoot,message,bypassReason?})`, and strict repository-root validation against discovered workspace repositories.

- [ ] Write failing tests for major staged diff, default minor commit, exact pass requirement, stale staged diff invalidation, message validation, and bypass rules.
- [ ] Run focused tests.
- [ ] Implement staged metadata/diff extraction, analysis, and guarded commit.
- [ ] Run focused tests.

### Task 6: Renderer experience and settings

**Files:** Create `src/renderer/src/components/{UnderstandingQuiz,UnderstandingSettings,QuizHistory}.tsx`; modify `TutorPane.tsx`, `SourceControlPanel.tsx`, `BottomPanel.tsx`, `App.tsx`, `workbench.ts`, and `styles.css`.

**Interfaces:** Reuse one accessible quiz component for proposal and Git flows; autosave draft answers; expose file navigation; render significance, reasons, progress, remediation, unlock, history, mastery, and all persisted trigger settings.

- [ ] Add renderer-state tests for progress, answer completeness, and source navigation where logic is nontrivial.
- [ ] Implement the change dossier and one-question flow with visible focus and reduced motion.
- [ ] Integrate proposal and staged-commit callbacks.
- [ ] Add settings and history summaries.
- [ ] Run typecheck and review at desktop-width breakpoints.

### Task 7: Full verification and security review

**Files:** Review all modified files and update `docs/AI_AGENT_ARCHITECTURE.md`.

- [ ] Run `npm test` and resolve every failure.
- [ ] Run `npm run typecheck` and resolve every diagnostic.
- [ ] Run `npm run build` and confirm the production renderer/main bundles succeed.
- [ ] Inspect `git diff --check`, `git status --short`, and the complete diff for leaked keys, answer-key exposure, path-trust regressions, missing gate checks, and unrelated changes.
- [ ] Compare delivered behavior to all acceptance criteria and report only genuine remaining limitations.
