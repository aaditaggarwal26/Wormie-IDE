# Advanced Search and Replace

## Scope

Package 3 upgrades the existing sidebar search into a safe workspace search and replacement flow. The essential slice includes debounced text search, case, whole-word and regular-expression modes, include and exclude globs, folder scoping, grouped results, replacement previews, selection by file or match, stale-content detection, binary rejection, line-ending preservation and partial-failure reporting.

Search history and additional result-management conveniences are intentionally deferred. They do not improve the correctness of the core search and replacement path.

## Boundaries

- The renderer owns query controls, grouping, selection and preview state.
- The main process owns filesystem traversal, ignore handling, matching against saved files and every write.
- The preload bridge exposes only structured search and replacement requests.
- Every response carries the active workspace root and a request ID. The renderer rejects responses from an older request or workspace.
- Replacement requests carry the searched content fingerprint, offsets and expected matched text. The main process rechecks all of them before writing.

## Safety

- Paths are resolved and checked against the active workspace in the main process.
- Root `.gitignore`, dependency and metadata exclusions, configured exclusions and request globs are applied before reading files.
- Files over 2 MB and files containing NUL bytes are not searched or changed.
- Replacements are planned from exact offsets, applied from the end of the file and rejected when ranges overlap.
- Replacement newlines are normalized to the file's existing line ending.
- One stale or inaccessible file does not apply an unsafe edit and is returned as a clear per-file failure.

## Verification

Focused tests cover regex validation, case and whole-word matching, replacement captures, ignored files, globs, stale fingerprints, binary files, path safety and line endings. Full tests, typechecking and a production build run before the package commit.
