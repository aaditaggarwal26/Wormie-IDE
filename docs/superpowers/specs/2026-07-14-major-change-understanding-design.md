# Major Change Understanding Design

## Decision

The approved task brief is implemented as a trusted Electron-main subsystem. The renderer may display context, collect answers, and request actions, but it cannot receive answer keys, mint passes, bypass gates, apply AI proposals, or create Git commits directly.

Three approaches were considered:

1. Extend the existing agent handler with all classification, persistence, grading, and Git logic. This minimizes files but further couples an already large security boundary.
2. Add a focused `understanding` domain used by both the agent and Git handlers. This adds a small set of modules while keeping deterministic logic independently testable. This is the selected approach.
3. Keep gate state in Zustand and call AI from the renderer. This is rejected because it exposes grading data and makes gates trivial to bypass.

## Architecture

The `understanding` domain has five responsibilities: normalize change inputs, score significance with deterministic rules, create a SHA-256 fingerprint, construct/redact bounded AI context, and persist quiz attempts, answers, passes, history, mastery, and settings in a versioned `electron-store` document. Its public service owns active quizzes and grading keys.

AI proposal generation produces a deterministic change analysis before the proposal is shown. A required result creates a quiz bound to the proposal fingerprint. `applyProposal` checks the persisted pass immediately before any native confirmation or write. Any content change produces a different fingerprint and therefore cannot reuse the pass.

Git analysis reads only the staged diff and staged file metadata from the selected repository. The main process classifies it, generates or restores a fingerprint-bound quiz when required, and creates the commit only when the exact staged fingerprint has passed. Minor commits proceed without a quiz under the default settings.

## Persistence

The application already uses `electron-store` as its local persistence abstraction and has no SQLite layer. A dedicated `understanding-state` store uses an explicit schema version and migration function. It persists sanitized public quiz state, private answer keys, submissions, attempts, pass records, history, concept mastery, and settings. Active quizzes are restored after restart. Pass records are always matched by change ID, source, and fingerprint.

## Quiz pipeline

Deterministic analysis remains available when AI is unavailable. Required quizzes use separate structured prompts for concept extraction/quiz generation and open-answer grading. The generator receives capped, redacted diff hunks and staged/proposed file metadata; lockfile noise, binary content, sensitive paths, and likely credentials are excluded. If AI generation fails, the gate remains locked and the durable pending state is preserved with a retryable error.

The renderer receives questions without `correctAnswer` or rubrics. Exact types are graded locally in the main process. Short answers are graded through the provider with a strict schema and conservative failure behavior: errors never pass a response.

## Experience

The existing right-hand learning surface becomes a two-gate flow: prerequisite learning before generation, then change understanding before apply. A compact change dossier shows significance, trigger reasons, concepts, files, flow, and risk. Questions advance one at a time with keyboard-operable controls, autosaved answers, progress, source links, retry/remediation, and a restrained unlocked state.

Source Control gains staged analysis, a commit message field, and the same understanding flow. Settings add trigger levels, pass threshold, question bounds, retry/remediation, AI/apply/commit requirements, strict mode, developer bypass, and written bypass-reason policy. Quiz history and mastery summaries populate the existing bottom and learning surfaces.

## Failure and security behavior

- AI/provider failures preserve the locked gate and saved progress.
- Missing, expired, stale, or fingerprint-mismatched passes fail closed.
- Commit and proposal apply handlers recompute the fingerprint at action time.
- Bypass is main-process validated, settings-controlled, reason-audited, and disabled for critical changes in strict mode.
- Telemetry is local structured metadata only; it excludes source, diff contents, answers, and filenames.
- IPC inputs are length-bounded and validated before filesystem, Git, or persistence operations.

## Testing

Vitest covers deterministic scoring and risks, threshold settings, stable fingerprints, redaction, exact grading, score calculation, gate transitions, invalidation, persistence migration/restoration, knowledge updates, schema validation, staged-commit behavior, proposal apply gating, bypass rules, and renderer-facing quiz state helpers. Full typecheck and Electron build are required before completion.
