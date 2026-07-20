# Quick Open and Command Palette Design

## Scope

Package 1 replaces the fixed command menu with a typed command registry and adds fast project-file navigation. It preserves existing workbench actions by registering their current handlers.

## Boundaries

- `src/main/workspaceFiles.ts` owns workspace traversal, exclusions, and bounded file indexing.
- Workspace IPC validates the sender, request shape, active workspace, and response generation.
- `src/renderer/src/commands/` owns command metadata, enablement, shortcuts, recents, and invocation.
- `src/renderer/src/components/WorkbenchPicker.tsx` provides the shared accessible keyboard and mouse picker.
- `src/renderer/src/components/QuickOpen.tsx` and `CommandPalette.tsx` adapt the shared picker.
- `App.tsx` supplies existing action callbacks but no longer contains command metadata or palette markup.

## State and persistence

The workbench store tracks the current workspace generation and recently opened file paths. Recent files and command IDs use a versioned, validated local record with bounded arrays. Missing files are removed when Quick Open resolves its empty query.

## Security and stale work

The renderer cannot enumerate arbitrary directories. The main process indexes only the active workspace, skips symbolic links and protected metadata, applies ignore rules, and returns relative paths. Every result carries the active workspace generation; the renderer discards results from a previous workspace.

## Interaction

- Quick Open: `Ctrl+P` or `Cmd+P`.
- Command Palette: `Ctrl+Shift+P` or `Cmd+Shift+P`.
- Arrow keys move selection, Enter invokes, Escape closes, and focus returns to the prior control.
- Filename matches rank ahead of directory-only matches and matching characters are highlighted.

## Verification

Pure tests cover fuzzy ranking, match ranges, command enablement, recents, persistence corruption, keyboard movement, exclusions, path safety, and stale workspace results. Package verification runs the focused tests, full suite, typecheck, and production build.
