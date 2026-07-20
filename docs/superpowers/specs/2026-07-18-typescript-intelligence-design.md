# JavaScript and TypeScript Intelligence

## Scope

Package 4 turns on the valuable JavaScript and TypeScript capabilities already supplied by Monaco and its TypeScript worker. It adds bounded workspace models, cross-file navigation, definitions, peeks, references, hover, signatures, import suggestions, quick fixes, code actions, organize imports, inlay hints, semantic validation, document symbol search, an outline view and a fingerprint-protected rename preview.

A separate language server, custom semantic-token implementation and broad multi-language abstraction are intentionally deferred. Monaco already provides the required JavaScript and TypeScript worker, so duplicating it would increase memory, startup cost and failure modes without improving the core experience.

## Boundaries

- Workspace file discovery and reads continue through the narrow preload API.
- The renderer creates a bounded set of Monaco text models for JavaScript and TypeScript files. It never reads the filesystem directly.
- Monaco's worker performs language analysis outside the UI thread.
- Requests have timeouts and workspace-generation checks. Results from an old workspace are ignored.
- Cross-file editor opens are routed back through Wormie's existing file-open flow.
- Rename preview uses worker locations, then re-reads each file through the preload bridge and applies edits through Package 3's validated replacement IPC.

## Limits

- At most 1,500 source files and 12 MB of source text are loaded into the TypeScript project model.
- Dependency, generated and ignored files remain excluded by the shared workspace index.
- Rename is limited to files inside the active workspace and a maximum of 200 files.

## Safety

- F2 and the command palette invoke Wormie's safe rename flow.
- Rename shows every file and before/after occurrence before applying.
- Files can be excluded from the preview.
- Dirty target files block rename until saved or closed.
- Every applied file carries the fingerprint captured during preview. Stale files fail without being overwritten.
- The normal Monaco rename provider is blocked for JavaScript and TypeScript so its direct-apply path cannot bypass preview.

## Verification

Focused tests cover Windows and POSIX file URI conversion, project bounds, request timeouts, stale workspace generations and rename preview construction. Full tests, typechecking and a production build run before the package commit.
