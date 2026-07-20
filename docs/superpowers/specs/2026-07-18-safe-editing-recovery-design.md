# Safe Editing and Recovery Design

## Scope

Package 2 adds the editing guarantees required for ordinary project files: explicit dirty-close decisions, Save All, essential autosave, bounded restart recovery, and protection from external disk changes.

## Boundaries

- The workbench store owns document contents, saved baselines, disk fingerprints, per-file view positions, closed-editor history, autosave settings, and external conflicts.
- `src/main/editorRecovery.ts` owns versioned validation and bounded persistence through narrow IPC.
- Workspace writes require the disk fingerprint observed when a file was read. A mismatch returns a conflict instead of overwriting.
- Main-process file watchers observe only validated open files inside the active workspace and emit workspace-scoped events.
- `DirtyFilesDialog` coordinates save, discard, and cancel decisions without embedding the workflow in `EditorPane`.
- `ExternalChangeReview` presents disk/local choices and a Monaco comparison when both versions exist.

## Autosave

The essential modes are Off, After Delay, and On Focus Change. Delay is bounded from 250 to 10,000 milliseconds. Every autosave path excludes unresolved AI proposal files.

## Recovery

Recovery schema version 1 stores at most 30 document records and 2 MB of dirty text. Clean files persist only path and view metadata. Deleted files and corrupt records are skipped. Recovery is workspace-scoped and cannot prevent startup.

AI proposal authorization remains main-process, in-memory, and time-bounded. Package 2 does not recreate expired authorization after a restart. Ordinary Save, Save All, and autosave continue to reject proposal-review files.

## External changes

Clean files reload automatically after a confirmed disk change. Dirty files enter a conflict state and are never overwritten silently. Users can compare, reload from disk, or keep the local version. Keeping local adopts the latest disk fingerprint so a later explicit save is intentional.

## Verification

Tests cover persistence validation, corrupt state, size bounds, deleted files, dirty-close planning, autosave eligibility, stale fingerprints, watcher path validation, external conflict transitions, and stale workspace events.
