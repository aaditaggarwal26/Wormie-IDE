# Wormie assignment format

Wormie assignments are defined by `.wormie/assignment.json` in the workspace root. The file is portable, versioned, and intended to be committed with the starter project.

## Version 1

The manifest contains assignment metadata, one or more tasks, the AI policy, and the evidence policy. Task paths use forward slashes and are relative to the workspace. Absolute paths, parent traversal, symbolic links, `.git`, `.wormie`, `node_modules`, and names that are invalid on common Windows or Unix filesystems are rejected.

```json
{
  "schemaVersion": 1,
  "id": "2c33be85-3479-4694-a728-376823929bdb",
  "title": "Complete the profile screen",
  "summary": "Build the final screen in the starter mobile application.",
  "instructions": "Read the existing screens before implementing the profile screen.",
  "createdAt": "2026-07-15T03:00:00.000Z",
  "updatedAt": "2026-07-15T03:00:00.000Z",
  "tasks": [
    {
      "id": "profile-screen",
      "title": "Implement profile screen",
      "description": "Complete the provided profile screen component.",
      "filePath": "src/screens/Profile.tsx",
      "kind": "implement",
      "acceptanceCriteria": ["The screen renders the student profile."]
    }
  ],
  "aiPolicy": {
    "mode": "learning-gated",
    "passingScore": 80,
    "allowGeneration": true
  },
  "evidencePolicy": {
    "includeAiActivity": true,
    "includeFileSnapshots": true
  }
}
```

The Electron main process validates and writes the manifest. Renderer code cannot choose an arbitrary destination. Writes use a flushed temporary file, atomic replacement, file-identity checks, and directory synchronization where the host operating system exposes it.

Like normal editor saves, assignment writes trust the local operating system not to let another privileged process replace workspace directories during the final pathname-based rename operation. Node does not expose a portable handle-relative rename API.

## Local packages

Teachers can export a `*.wormie-package.json` file from the Assignments panel. A package contains the validated assignment and a hashed Base64 snapshot of the starter project. Wormie excludes repository metadata, build output, dependencies, local assignment metadata, common secret files, and symbolic links. Version 1 packages are limited to 5,000 files, 2 MB per file, and 25 MB of source data.

Package hashes detect corruption and inconsistent file contents. Version 1 packages are not cryptographically signed and do not prove the identity of the teacher who created them.

## Student progress and consent

Imported packages are registered as student workspaces. Teacher assignment mutation and package export are denied for those workspaces in the Electron main process. Assignment metadata is hidden from the normal Explorer and cannot be changed through the general workspace IPC API.

Student identity, consent, task status, notes, and AI activity are stored under Electron's per-user application-data directory, outside the project and its Git repository. Progress is bound to the canonical workspace path, assignment ID, exact manifest revision, and a compare-and-swap progress revision. Wormie uses a single-instance lock so two desktop processes cannot overwrite the same local record.

The consent record contains the exact evidence categories requested by the manifest and the acceptance time. AI activity evidence records requests, concepts, lesson summaries, quiz scores, generated proposal summaries and paths, and apply decisions. AI policy is enforced in the main process at learning-session creation, proposal generation, and proposal application. Changing the assignment revision invalidates an active learning session.

## Submissions

After every task is complete, a student can submit the assignment. Classroom assignments upload the validated submission to private classroom storage and atomically record its metadata for authorized teacher review. Manually imported assignments save a `*.wormie-submission.json` file outside the project. Both transports use the same versioned submission schema, containing finalized progress and only the evidence categories accepted at enrollment:

- AI activity events when `includeAiActivity` is enabled.
- Snapshots of assignment task files when `includeFileSnapshots` is enabled.

File snapshots are Base64 encoded and include SHA-256 hashes. Version 1 submissions are limited to 2 MB per task file, 10 MB of task-file data, and 16 MB of JSON. The teacher opens the submission from the matching assignment revision and can inspect progress, AI evidence counts, and final task-file contents.

Submission hashes provide integrity checks, not authorship or non-repudiation. Classroom transport authenticates the current Supabase user, enforces classroom membership and teacher visibility through Row Level Security, validates assignment and progress revisions, and stores objects in a private bucket. Local JSON transport intentionally provides none of those hosted authorization properties and should be treated as a manual exchange format.
