# Agent Activity and Codex Streaming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix Codex structured-response collection and add an optional live activity timeline, expandable sanitized technical log, and clickable proposed/applied file lists to the AI Tutor.

**Architecture:** A focused turn-capture object consumes Codex item and completion notifications before `turn/start`, removing the response race and wrong-event lookup. Main-process orchestration emits bounded, sanitized activity over one-way IPC; the renderer reduces those events into a current-run trace and presents them in a focused sidebar component.

**Tech Stack:** Electron 43, TypeScript 7, React 19, TanStack Query 5, Framer Motion 12, Zod 4, Vitest 4, Electron Builder 26.

## Global Constraints

- Preserve **Understand first. Generate second.**
- Never expose hidden chain-of-thought, prompts, source/generated contents, credentials, environment data, or unrestricted stderr.
- Preserve the read-only Codex sandbox, disabled tools, ephemeral thread, account checks, native confirmation, and all understanding gates.
- Keep activity IPC one-way, allowlisted, validated, and bounded to 120 current-run events.
- Do not add dependencies.
- Existing dirty-worktree changes belong to the user; skip commits when a file's full diff includes earlier work.
- Production acceptance requires tests, typecheck, build, packaging, artifact inspection, and a manual smoke checklist.

---

### Task 1: Capture structured output from Codex item events

**Files:**
- Create: `src/main/agent/codexTurnCapture.ts`
- Create: `src/main/agent/codexTurnCapture.test.ts`
- Modify: `src/main/agent/codexAppServer.ts`
- Modify: `src/main/agent/codexAppServer.test.ts`

**Interfaces:**
- Consumes: `item/completed`, `item/agentMessage/delta`, and `turn/completed` params.
- Produces: `CodexTurnCapture.accept`, `waitForCompletion`, `outputFor`, and `dispose`.

- [ ] **Step 1: Write the failing capture tests**

```ts
const capture = new CodexTurnCapture('thread-a')
capture.accept('item/completed', { threadId: 'thread-b', turnId: 'turn-a', item: { type: 'agentMessage', text: '{"wrong":true}' } })
capture.accept('item/completed', { threadId: 'thread-a', turnId: 'turn-a', item: { type: 'agentMessage', text: '{"ok":true}' } })
capture.accept('turn/completed', { threadId: 'thread-a', turn: { id: 'turn-a', status: 'completed', error: null } })
expect((await capture.waitForCompletion('turn-a', new AbortController().signal)).turn.status).toBe('completed')
expect(capture.outputFor('turn-a')).toBe('{"ok":true}')
```

Cover the remaining branches with these concrete assertions:

```ts
const delta = new CodexTurnCapture('thread-a')
delta.accept('item/agentMessage/delta', { threadId: 'thread-a', turnId: 'turn-a', delta: '{"ok":' })
delta.accept('item/agentMessage/delta', { threadId: 'thread-a', turnId: 'turn-a', delta: 'true}' })
expect(delta.outputFor('turn-a')).toBe('{"ok":true}')
expect(delta.outputFor('turn-b')).toBeNull()

const early = new CodexTurnCapture('thread-a')
early.accept('turn/completed', { threadId: 'thread-a', turn: { id: 'turn-a', status: 'completed', error: null } })
await expect(early.waitForCompletion('turn-a', new AbortController().signal)).resolves.toMatchObject({ turn: { id: 'turn-a' } })

const controller = new AbortController()
const cancelled = new CodexTurnCapture('thread-a')
const waiting = cancelled.waitForCompletion('turn-a', controller.signal)
controller.abort()
await expect(waiting).rejects.toMatchObject({ name: 'AbortError' })
expect(cancelled.outputFor('turn-a')).toBeNull()
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/main/agent/codexTurnCapture.test.ts`

Expected: FAIL because `codexTurnCapture.ts` does not exist.

- [ ] **Step 3: Implement the capture object**

```ts
export type CapturedTurnCompletion = {
  threadId: string
  turn: { id: string; status: string; error: null | { message?: string } }
}

export class CodexTurnCapture {
  constructor(private readonly threadId: string, onProtocolEvent?: (method: string, detail: string) => void)
  accept(method: string, params: unknown): void
  waitForCompletion(turnId: string, signal: AbortSignal): Promise<CapturedTurnCompletion>
  outputFor(turnId: string): string | null
  dispose(error?: Error): void
}
```

Validate all unknown params before use. Store completed messages, deltas, early completions, and waiters by turn id. Prefer completed message text over deltas.

- [ ] **Step 4: Verify GREEN**

Run: `npx vitest run src/main/agent/codexTurnCapture.test.ts`

Expected: all capture tests pass.

- [ ] **Step 5: Subscribe before `turn/start`**

Add `CodexAppServer.subscribeNotification(method, listener): () => void`. After `thread/start`, subscribe one capture instance to item/delta/turn events before calling `turn/start`. Await the capture's matching completion, read `outputFor`, parse JSON, validate with Zod, and clean up in `finally`. Remove the invalid `completed.turn.items` lookup.

- [ ] **Step 6: Add the integration regression fixture and verify**

Use a protocol fixture that emits `item/completed` then `turn/completed` without a real account. Run:

`npx vitest run src/main/agent/codexTurnCapture.test.ts src/main/agent/codexAppServer.test.ts`

Expected: all focused tests pass, including bundled runtime startup.

- [ ] **Step 7: Commit only an isolated diff**

```powershell
git diff -- src/main/agent/codexTurnCapture.ts src/main/agent/codexTurnCapture.test.ts src/main/agent/codexAppServer.ts src/main/agent/codexAppServer.test.ts
git add -- src/main/agent/codexTurnCapture.ts src/main/agent/codexTurnCapture.test.ts src/main/agent/codexAppServer.ts src/main/agent/codexAppServer.test.ts
git commit -m "fix: collect codex structured output events"
```

Skip this commit if the reviewed files contain inseparable earlier work.

---

### Task 2: Define and secure activity IPC

**Files:**
- Create: `src/main/agent/activity.ts`
- Create: `src/main/agent/activity.test.ts`
- Modify: `src/shared/contracts.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/main/agent/provider.ts`
- Modify: `src/main/agent/index.ts`

**Interfaces:**
- Consumes: main orchestration phases and allowlisted Codex protocol methods.
- Produces: `AgentActivityEvent`, `sanitizeAgentActivity`, and `DesktopApi.onAgentActivity`.

- [ ] **Step 1: Write failing sanitizer tests**

```ts
const event = sanitizeAgentActivity({
  id: 'event-1', runId: 'run-1', timestamp: '2026-07-15T00:00:00.000Z',
  kind: 'protocol', phase: 'model', label: 'Receiving response', state: 'active',
  detail: 'x'.repeat(500), protocolMethod: 'secret/custom',
  files: Array.from({ length: 80 }, (_, index) => ({ path: `src/${index}.ts`, action: 'update' as const }))
})
expect(event.detail).toHaveLength(240)
expect(event.protocolMethod).toBeUndefined()
expect(event.files).toHaveLength(50)
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/main/agent/activity.test.ts`

Expected: FAIL because the activity module does not exist.

- [ ] **Step 3: Add exact shared contracts**

```ts
export type AgentActivityState = 'pending' | 'active' | 'completed' | 'failed' | 'stopped'
export type AgentActivityPhase = 'context' | 'learning' | 'model' | 'validation' | 'quiz' | 'proposal' | 'approval' | 'apply' | 'complete'
export type AgentActivityFile = { path: string; action: 'create' | 'update' | 'applied' }
export type AgentActivityEvent = {
  id: string; runId: string; timestamp: string; kind: 'phase' | 'protocol' | 'files'
  phase: AgentActivityPhase; label: string; state: AgentActivityState
  detail?: string; protocolMethod?: string; files?: AgentActivityFile[]
}
```

Add `agentActivity` to `IPC_CHANNELS`, `runId` to `LearningRequest` and `LearningSession`, and `onAgentActivity(callback): () => void` to `DesktopApi`.

- [ ] **Step 4: Implement sanitization and one-way preload delivery**

Allow only `item/started`, `item/completed`, `item/agentMessage/delta`, and `turn/completed`. Bound ids to 100, labels to 120, detail to 240, paths to 260, and files to 50. Add only this preload method:

```ts
onAgentActivity: (callback) => {
  const listener = (_event: IpcRendererEvent, activity: AgentActivityEvent) => callback(activity)
  ipcRenderer.on(IPC_CHANNELS.agentActivity, listener)
  return () => ipcRenderer.removeListener(IPC_CHANNELS.agentActivity, listener)
}
```

- [ ] **Step 5: Verify sanitizer GREEN**

Run: `npx vitest run src/main/agent/activity.test.ts`

Expected: bounds, allowlist, and invalid-payload tests pass.

- [ ] **Step 6: Emit phases and protocol metadata**

Validate `LearningRequest.runId`, store it in `InternalSession`, and emit through the initiating `WebContents`. Mark context, model, validation, quiz, proposal, approval, apply, completion, failure, and stop transitions. Pass a per-call protocol callback through `ModelGateway` to `CodexAppServer`. Proposal events carry relative create/update paths; successful apply emits changed paths only after every write succeeds.

- [ ] **Step 7: Verify IPC types and focused tests**

Run: `npx vitest run src/main/agent/activity.test.ts src/main/agent/codexTurnCapture.test.ts && npm run typecheck`

Expected: tests and both TypeScript projects pass.

- [ ] **Step 8: Commit only an isolated diff**

Review the complete diff for the six listed files. Commit with `feat: stream sanitized agent activity` only when no earlier work would be absorbed; otherwise preserve the dirty worktree and skip the commit.

---

### Task 3: Build the bounded renderer activity model

**Files:**
- Create: `src/renderer/src/components/agentActivityModel.ts`
- Create: `src/renderer/src/components/agentActivityModel.test.ts`

**Interfaces:**
- Consumes: validated `AgentActivityEvent` values.
- Produces: `initialAgentActivityState`, `reduceAgentActivity`, and `isRenderableAgentActivity`.

- [ ] **Step 1: Write failing reducer tests**

```ts
let state = initialAgentActivityState('run-1')
state = reduceAgentActivity(state, { id: 'a', runId: 'run-1', timestamp: '2026-07-15T00:00:00.000Z', kind: 'phase', phase: 'model', label: 'Receiving', state: 'active' })
state = reduceAgentActivity(state, { id: 'b', runId: 'run-1', timestamp: '2026-07-15T00:00:01.000Z', kind: 'phase', phase: 'model', label: 'Received', state: 'completed' })
expect(state.phases).toHaveLength(1)
expect(state.phases[0].state).toBe('completed')
```

Cover bounds, file replacement, and runtime validation with these concrete assertions:

```ts
state = reduceAgentActivity(state, { id: 'wrong', runId: 'run-2', timestamp: '2026-07-15T00:00:00.000Z', kind: 'phase', phase: 'model', label: 'Wrong run', state: 'active' })
expect(state.phases).toHaveLength(1)
for (let index = 0; index < 130; index += 1) {
  state = reduceAgentActivity(state, { id: `${index}`, runId: 'run-1', timestamp: '2026-07-15T00:00:00.000Z', kind: 'protocol', phase: 'model', label: 'Protocol', state: 'active', protocolMethod: 'item/started' })
}
expect(state.technical).toHaveLength(120)
state = reduceAgentActivity(state, { id: 'files-a', runId: 'run-1', timestamp: '2026-07-15T00:00:00.000Z', kind: 'files', phase: 'proposal', label: 'Proposed files', state: 'completed', files: [{ path: 'src/a.ts', action: 'update' }] })
state = reduceAgentActivity(state, { id: 'files-b', runId: 'run-1', timestamp: '2026-07-15T00:00:01.000Z', kind: 'files', phase: 'proposal', label: 'Proposed files', state: 'completed', files: [{ path: 'src/b.ts', action: 'create' }] })
expect(state.files.proposal).toEqual([{ path: 'src/b.ts', action: 'create' }])
expect(isRenderableAgentActivity({ kind: 'secret' })).toBe(false)
```

- [ ] **Step 2: Verify RED**

Run: `npx vitest run src/renderer/src/components/agentActivityModel.test.ts`

Expected: FAIL because the model does not exist.

- [ ] **Step 3: Implement validation and reduction**

Keep stable phase ordering, replace a phase's latest row, append protocol rows, replace file groups, ignore late other-run events, and retain only the newest 120 technical entries.

- [ ] **Step 4: Verify GREEN and commit isolated new files**

Run: `npx vitest run src/renderer/src/components/agentActivityModel.test.ts`

Expected: all model tests pass. Commit the two new files as `feat: model bounded agent activity`.

---

### Task 4: Add the optional two-layer sidebar UI

**Files:**
- Create: `src/renderer/src/components/AgentActivity.tsx`
- Modify: `src/renderer/src/components/TutorPane.tsx`
- Modify: `src/renderer/src/styles.css`

**Interfaces:**
- Consumes: `AgentActivityViewState`, proposed files, applied files, and file-open callbacks.
- Produces: an accessible Activity toggle, live timeline, technical log, and file lists.

- [ ] **Step 1: Create `AgentActivity`**

```ts
type AgentActivityProps = {
  state: AgentActivityViewState | null
  onOpenProposedFile: (relativePath: string) => void
  onOpenAppliedFile: (absolutePath: string) => void
}
```

Render phase rows in an `aria-live="polite"` region, proposed/applied file buttons, and technical rows inside a collapsed `<details>`. Use timestamps and allowlisted methods only.

- [ ] **Step 2: Integrate `TutorPane` state**

Generate `runId = crypto.randomUUID()` when submitting a request, initialize state, include it in `startLearning`, and subscribe once with `useEffect` to `onAgentActivity`. Open Activity automatically on start/failure but let the user close it. Keep a successful trace after apply; clear only on new request or Reset.

Proposed-file clicks focus the matching proposal `<details>`. Applied-file clicks call `readFile` then `openDocument`, routing failures to the existing error callout.

- [ ] **Step 3: Add Wormie-specific styling**

Use existing dark tokens, a one-pixel vertical trace, green/amber/red/active states, utility text for phases, monospace protocol rows, visible `:focus-visible`, bounded log scrolling, and `prefers-reduced-motion` support. Do not add gradients or oversized cards beyond existing surfaces.

- [ ] **Step 4: Verify UI contracts**

Run: `npx vitest run src/renderer/src/components/agentActivityModel.test.ts && npm run typecheck`

Expected: tests and all TSX/preload/main types pass.

- [ ] **Step 5: Perform the development visual check**

Run `npm run dev`; inspect idle, active, failed, proposal, applied, narrow-sidebar, keyboard, and reduced-motion states. Expand the technical log and verify no prompt or file contents appear.

- [ ] **Step 6: Commit only an isolated diff**

Commit as `feat: show agent activity and changed files` only if the complete `TutorPane.tsx` and `styles.css` diffs contain no inseparable earlier changes.

---

### Task 5: Verify and package the production build

**Files:**
- Inspect: `out/**`
- Inspect: `release/**`
- Modify `electron-builder.yml` only if a reproduced packaging defect requires it.

**Interfaces:**
- Consumes: the complete implementation.
- Produces: passing evidence and an installable artifact.

- [ ] **Step 1: Run full verification sequentially**

```powershell
npm test
npm run typecheck
npm run build
```

Expected: every command exits 0. Do not run tests and build concurrently on Windows because the native Codex integration test may lock its temporary executable.

- [ ] **Step 2: Review the entire diff**

```powershell
git diff --check
git status --short
git diff -- src/main/agent src/preload/index.ts src/shared/contracts.ts src/renderer/src/components src/renderer/src/styles.css
```

Expected: no whitespace errors, secrets, raw prompts/contents in activity, or unrelated rewrites.

- [ ] **Step 3: Produce production artifacts**

Run: `npm run dist`

Expected: Electron Builder exits 0 and writes the Windows NSIS artifact under `release/` using the configured `${productName}-${version}-${os}-${arch}.${ext}` template.

- [ ] **Step 4: Inspect package contents**

Confirm main, preload, and renderer output exists and `@openai/codex-win32-x64/vendor/x86_64-pc-windows-msvc/bin/codex.exe` is unpacked. Confirm no `.env`, `auth.json`, npm cache, tests, or temporary Codex homes are packaged.

- [ ] **Step 5: Execute the production smoke checklist**

Verify ChatGPT sign-in; learning request; live Activity; collapsed/expanded sanitized log; quiz; proposal; proposed-file opening; understanding gate; native apply confirmation; applied-file opening; cancellation; and an actionable controlled provider error.

- [ ] **Step 6: Record evidence**

Report test counts, command exit codes, artifact names/sizes, bundled Codex presence, smoke results, skipped manual items, and remaining disk space. Do not claim production readiness when packaging or a critical smoke item fails.
