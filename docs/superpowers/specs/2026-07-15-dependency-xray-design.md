# Dependency X-ray Design

## Summary

Dependency X-ray helps a developer understand how the TypeScript or JavaScript symbol under their cursor fits into the current workspace. It exposes definitions, incoming relationships, outgoing relationships, and a reasoned change-impact estimate before the developer edits or accepts generated code.

The first release is intentionally TypeScript/JavaScript-first. Analysis runs locally through the TypeScript compiler API and requires no external database, hosted index, account, or background service.

## Goals

- Resolve the symbol under the active editor cursor accurately.
- Explain what the symbol is, where it is defined, what uses it, and what it uses.
- Estimate a bounded, explainable blast radius for changing the symbol.
- Navigate from every reported relationship to the exact source location.
- Include unsaved active-editor content in the analysis.
- Keep analysis responsive, cancellable, workspace-scoped, and local.
- Reinforce Wormie's principle: understand the dependency flow before changing code.

## Non-goals

- Supporting languages other than TypeScript and JavaScript in the first release.
- Building or persisting a complete repository-wide dependency graph.
- Replacing Monaco IntelliSense, Find References, or a full language server.
- Using an AI model to invent or repair static-analysis results.
- Adding cloud storage, telemetry, or a separate database.
- Computing runtime relationships that cannot be established through static analysis.

## User Experience

### Entry point

The editor breadcrumb bar includes a **Dependency X-ray** button. It is enabled when a TypeScript or JavaScript document is active. The user places the cursor on an identifier and activates the button with the mouse or command palette.

If the cursor is not on a resolvable symbol, the drawer opens with a concise prompt to select or place the cursor on a named symbol. Unsupported files show that TypeScript and JavaScript are supported in this version.

### X-ray drawer

A resizable drawer opens between the editor and the existing AI Tutor. It does not replace the tutor or change the active editor document. The drawer contains:

1. **Symbol header** — symbol name, kind, signature when available, workspace-relative definition path, and location.
2. **What it does** — a deterministic summary based on symbol kind, signature, and relationships. It does not claim semantic behavior that static analysis cannot prove.
3. **Used by** — incoming references grouped by file and enclosing symbol.
4. **Uses** — outgoing symbol references from the selected declaration's implementation, grouped by file and enclosing symbol.
5. **Blast radius** — Low, Medium, or High with visible factors and counts.

Every definition or relationship row is clickable and opens the target file at its exact line. Duplicate references within the same enclosing symbol are collapsed and show a reference count.

### Loading and stale results

The drawer displays the symbol being analyzed and a cancellable loading state. Moving the cursor does not automatically rerun analysis. A new manual request cancels the previous request. Results are stamped with the active file and document version; the renderer discards results that no longer match the request.

The drawer provides a Refresh action after a document changes. This avoids expensive analysis on every keystroke and keeps the relationship between user intent and analysis explicit.

## Architecture

### Renderer

`EditorPane` owns the Monaco editor reference and creates an X-ray request from:

- active workspace root;
- active file path;
- cursor line and column;
- active document content;
- a renderer-generated request ID and document version.

The editor exposes an `onRequestDependencyXray` callback rather than calling IPC directly. `App` coordinates request state, drawer visibility, file navigation, cancellation, and stale-result rejection. A focused `DependencyXrayDrawer` renders the result without taking responsibility for analysis.

### Preload and shared contracts

The preload bridge exposes only these methods:

- `analyzeDependencyXray(request)`;
- `cancelDependencyXray(requestId)`.

Shared contracts define the request, symbol metadata, relationship locations, grouped relationships, blast-radius explanation, supported status, limits, and structured error codes. Renderer code never receives absolute paths outside the workspace.

### Main process

A `dependencyXray` module registers IPC handlers and contains three isolated responsibilities:

- **Project resolver** discovers the nearest applicable `tsconfig.json` or `jsconfig.json`, validates workspace containment, and creates inferred compiler options when no config exists.
- **Program builder** constructs a TypeScript `Program`, overlays the unsaved active document, and keeps a bounded in-memory cache keyed by workspace, configuration path, and relevant file modification metadata.
- **Symbol analyzer** resolves the cursor symbol and produces normalized definition, incoming, outgoing, and blast-radius data.

The module receives the active workspace root through the same callback pattern used by the current workspace, Git, terminal, assignment, and agent handlers.

## Analysis Rules

### Supported files

The analyzer supports `.ts`, `.tsx`, `.js`, `.jsx`, `.mts`, `.cts`, `.mjs`, and `.cjs` files. It excludes `.d.ts` files from relationship counts unless the selected symbol itself is defined in a declaration file.

The project resolver respects the workspace's compiler configuration. Without a configuration file, it enables JavaScript, JSX, Node-style module resolution, and no emit. It scans supported files while excluding `.git`, `.wormie`, `node_modules`, build outputs, coverage, and other directories already ignored by the workspace tree.

### Symbol resolution

The analyzer converts the one-based Monaco position to an offset, finds the narrowest identifier-like node at that offset, obtains its compiler symbol, and follows aliases to the underlying symbol. A definition includes the declaration location, symbol kind, display name, and TypeScript-rendered signature when available.

### Incoming relationships

Incoming relationships are workspace source references whose resolved symbol matches the selected symbol. Import/export aliases are followed. Declaration sites and type-only references remain visible but are labeled so the user can distinguish runtime usage from type usage.

Relationships are grouped by source file and nearest enclosing named declaration. Repeated references within one group are collapsed into a count while retaining the first navigable location.

### Outgoing relationships

Outgoing relationships are resolved symbol references within the selected symbol's implementation declaration. Local variables, parameters, language-library declarations, and self-references are excluded. Imported symbols and workspace declarations are included. If the selected symbol has no implementation body, the result explains that outgoing analysis is unavailable.

### Blast radius

Blast radius is a deterministic classification, not an AI prediction. The result exposes every factor that contributed to the rating:

- Low: up to two incoming enclosing symbols across one file and no public export.
- Medium: three to eight incoming enclosing symbols, two to four files, or an exported symbol.
- High: more than eight incoming enclosing symbols, more than four files, or a symbol re-exported through a workspace entry point.

The highest matching level wins. Counts are calculated after grouping duplicates. The UI always shows counts and triggered factors so the user can judge the estimate.

## Safety and Performance

- Main-process handlers reject requests that do not originate from the trusted renderer.
- Workspace roots and all requested/result paths are resolved and checked against the active workspace.
- Symlinks are not followed outside the workspace.
- The active content overlay is limited to the existing 2 MB editor limit.
- Analysis is capped at 200 incoming groups and 100 outgoing groups. Truncated results include the cap and a visible warning.
- Only one active analysis runs per renderer. Cancellation prevents obsolete work from being returned, although TypeScript's synchronous compiler phases may finish before cancellation is observed.
- Cache entries are memory-only, bounded to the two most recent project states, and cleared when the active workspace changes.
- Analysis errors are normalized and do not expose arbitrary filesystem content or stack traces to the renderer.

## Error States

The drawer distinguishes:

- unsupported file type;
- cursor not on a resolvable symbol;
- file no longer present;
- malformed project configuration with inferred-settings fallback;
- analysis cancelled;
- result limit reached;
- generic analysis failure.

A malformed project configuration produces a non-blocking warning and continues with inferred settings when possible. A generic failure offers Retry and records a concise message in the existing Output panel.

## Testing

### Analyzer unit tests

Fixture workspaces verify:

- local and imported symbol definitions;
- aliased imports and re-exports;
- incoming callers and type-only references;
- outgoing dependencies;
- duplicate grouping;
- unsaved active-document overlays;
- inferred settings without a project config;
- malformed configuration fallback;
- declaration-file behavior;
- deterministic blast-radius thresholds;
- result truncation and cancellation.

### Security tests

Tests reject files outside the active workspace, traversal attempts, mismatched workspace roots, unsupported extensions, oversized overlays, and untrusted IPC senders.

### Renderer tests

Model-level tests cover loading, empty-symbol, unsupported, truncated, stale, cancelled, and success states. Component tests verify section labels, accessible controls, result grouping, blast-radius explanations, and navigation callbacks.

### Integration verification

The implementation must pass the existing test suite, TypeScript typecheck, and production Electron build. A focused integration fixture verifies that clicking an X-ray relationship opens the expected file and line.

## Delivery Scope

The first implementation delivers on-demand TypeScript/JavaScript analysis, the editor entry point, the resizable drawer, exact navigation, deterministic blast radius, cancellation, limits, local caching, and tests. Automatic analysis, persistent graph history, multi-language support, graphical node canvases, and AI-generated explanations are deferred until the core results prove reliable.
