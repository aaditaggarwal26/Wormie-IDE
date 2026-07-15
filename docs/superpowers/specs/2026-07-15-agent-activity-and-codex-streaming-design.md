# Agent Activity and Codex Streaming Design

## Goal

Make Wormie's AI Tutor feel observable and trustworthy during long-running work while fixing Codex account responses that currently fail with `Codex completed without a structured response.` The result must support a production build, not only the development server.

Wormie's product rule remains unchanged: **Understand first. Generate second.** Activity reporting must explain what the system is doing without bypassing the learning or understanding gates.

## Product behavior

The AI Tutor header gains an **Activity** control. The control opens a compact activity surface inside the existing right sidebar. It is available throughout the request, learning, proposal, and apply stages.

The surface has two layers:

1. A clean live timeline for normal use.
2. An expandable **Technical log** for sanitized protocol details.

The timeline uses stable, user-facing phases rather than simulated model thoughts:

- Gathering workspace context
- Preparing the learning plan
- Receiving the Codex response
- Validating structured output
- Waiting for the understanding check
- Preparing proposed files
- Waiting for proposal approval
- Applying approved changes
- Completed, stopped, or failed

The interface must never label private chain-of-thought as visible reasoning. It may show concise progress summaries, protocol event types, model-provided answer summaries, and file operations. The technical log must not display prompts, file contents, authentication data, environment variables, or unrestricted runtime stderr.

## File visibility

Before changes are applied, the activity surface shows a **Proposed files** group derived from `CodeProposal.changes`. Each row includes the relative path and action (`create` or `update`). Selecting a proposed file opens its existing proposal preview rather than writing it to disk.

After native confirmation and a successful apply, the surface retains a **Changed files** group derived from `AppliedProposal.changedPaths`. Selecting a changed file opens the saved workspace file in the editor. The completion state remains visible until the next request or an explicit reset so the user can inspect what happened.

The existing proposal review remains the authoritative place for full generated contents, explanations, risks, verification steps, and the understanding gate.

## Runtime correction

`CodexAppServer.generateStructured` currently searches for an `agentMessage` inside `turn/completed.params.turn.items`. Current Codex app-server behavior streams work through item notifications and uses `turn/completed` as a final status notification. Wormie must collect the structured answer from the matching thread and turn's `item/completed` events, with `item/agentMessage/delta` as a safe fallback for compatible runtime versions.

The collector will:

- Subscribe before `turn/start` can complete to avoid missing fast notifications.
- Scope every item and delta to the active thread and turn.
- Capture only agent-message text needed for the structured result.
- Treat `turn/completed` as the authoritative final status.
- Prefer completed agent-message text, then accumulated deltas.
- Parse JSON and validate it with the requested Zod schema.
- Unsubscribe and remove abort listeners on success, failure, or cancellation.
- Preserve the existing read-only sandbox, disabled tools, ephemeral thread, and account checks.

If a completed turn has no usable agent message, the error must name the missing event/output condition without dumping sensitive runtime data.

## Activity event architecture

Introduce a shared `AgentActivityEvent` contract with:

- A unique event id and timestamp.
- A request/run id.
- A stable phase or protocol kind.
- A user-facing label.
- A state: `pending`, `active`, `completed`, `failed`, or `stopped`.
- Optional sanitized detail.
- Optional relative file metadata.

Main-process agent orchestration owns authoritative phase transitions. `CodexAppServer` reports sanitized protocol activity through a callback supplied by the orchestrator. The main process forwards events to the initiating renderer using a narrow one-way IPC channel. The preload exposes a subscribe/unsubscribe method; it does not expose arbitrary event sending.

The renderer owns presentation state only. It keeps events for the current run, replaces matching phase rows as their states change, bounds the technical log length, and retains the completed run until reset or a new request.

OpenAI-compatible providers emit the same user-facing phases even though they do not emit Codex app-server protocol events. Their technical log identifies provider generation and validation events without inventing Codex methods.

## Sidebar design

The activity control sits in the Tutor header next to the current stage badge. It has an accessible pressed state and a visible keyboard focus treatment. Activity opens inline beneath the header so it does not obscure the quiz or proposal.

The visual language follows the existing Wormie IDE:

- Quiet dark surfaces already used by the sidebar.
- A thin vertical trace connecting phase markers.
- Green for completed work, amber for waiting, red for failures, and the existing accent for active work.
- Compact utility typography for phases and monospace typography for protocol rows.
- No oversized cards, decorative gradients, or unrelated animation.
- One restrained transition when the activity surface opens; reduced-motion preferences disable it.

The technical log is collapsed by default. Each row shows time, method/category, and sanitized outcome. It is scrollable and capped so long sessions do not grow memory without bound.

## Error and cancellation behavior

- A runtime error marks the active phase failed and appears both in the existing error callout and the timeline.
- Cancellation marks the run stopped, removes listeners, interrupts the Codex turn, and keeps the stopped trace visible.
- Starting a new request creates a new run and clears the prior trace.
- Renderer unmount removes the IPC listener.
- Duplicate or late events from a prior run are ignored.
- Applying a proposal updates file activity only after all writes succeed; rollback failures never appear as successful file edits.

## Security and privacy

- Never send raw prompts, source contents, generated file contents, tokens, account data, or environment data through activity IPC.
- Normalize protocol details to an allowlisted set of method and item names.
- Bound labels, details, event count, and file path count.
- Validate activity payloads at the renderer boundary before displaying them.
- Preserve context isolation, disabled Node integration, and the narrow preload API.
- Continue requiring native confirmation and all configured understanding gates before file writes.

## Testing and production acceptance

Automated coverage must include:

- Completed agent-message extraction from `item/completed`.
- Delta fallback when completed text is absent.
- Cross-thread and cross-turn event isolation.
- Missing-output, failed-turn, and cancellation cleanup.
- Activity sanitization and bounded log retention.
- IPC subscribe/unsubscribe behavior.
- Timeline state reduction, proposed files, and applied files.
- No regression to the learning and proposal understanding gates.

Acceptance commands:

```powershell
npm test
npm run typecheck
npm run build
```

The packaged application must also be produced with the repository's Electron Builder configuration and inspected for the bundled Codex executable and required renderer/main output. A manual smoke test must cover ChatGPT sign-in, a learning request, activity expansion, technical-log expansion, quiz completion, proposal file inspection, native apply confirmation, and opening an applied file.

## Out of scope

- Exposing hidden chain-of-thought or internal reasoning tokens.
- Allowing the restricted model runtime to use shell, filesystem, MCP, or web tools.
- Applying files before the user passes the required gates and confirms the native dialog.
- Persisting full activity history across application restarts.
- Replacing the existing proposal diff/review workflow.
