# Wormie IDE

Wormie is an Electron desktop IDE built around one rule: understand first, generate second.

## Run locally

```powershell
npm install
npm run dev
```

Use `npm run build` for a production build and `npm run dist` to create the desktop installer.

## Product modes

After sign-in, Wormie opens a launcher with two explicit destinations:

- Sandbox IDE is an ordinary coding workspace. It contains the editor, Explorer, search, source control, terminal, Tutor, and IDE settings. Opening a folder here never attaches it to a classroom, even if the folder contains an assignment manifest.
- Classrooms is a full-screen portal for teaching and enrolled classrooms. It contains assignments, people, classroom mastery, and teacher settings without editor or terminal chrome.

Opening a classroom assignment or starting a teacher draft launches Assignment IDE. This mode keeps the coding tools and one focused assignment context. Returning to the classroom uses the existing dirty-file guard before leaving the workspace.

The renderer stores only validated portal selection preferences. It does not restore directly into a classroom or assignment after restart. Editor recovery remains independent and workspace-scoped.

## Local assignment workflow

1. A teacher opens a starter project, chooses Assignments, creates the brief and tasks, sets the AI and evidence policies, and exports a `*.wormie-package.json` file.
2. A student chooses Import assignment package. Wormie creates an isolated student copy, records explicit local evidence consent, and tracks task progress outside the repository.
3. The assignment AI policy is enforced by the Electron main process. Learning sessions, quizzes, proposals, and applied changes are recorded only when the student accepted AI evidence collection.
4. After every task is complete, the student saves a `*.wormie-submission.json` file outside the project.
5. The teacher opens the original assignment and chooses Open student submission to review progress, AI-use evidence, and final task files.

Packages and submissions are integrity checked but are not cryptographically signed. See [docs/ASSIGNMENT_FORMAT.md](docs/ASSIGNMENT_FORMAT.md) for schemas, limits, privacy behavior, and the hosted-service migration boundary.

## Classroom cloud migrations

Supabase migrations are additive and must be applied in filename order. The product-mode work adds:

- `202607190001_classroom_roster_management.sql` for privacy-filtered member reads and teacher-authorized add/remove operations.
- `202607190002_classroom_mastery.sql` for classroom/student mastery snapshots, immutable quiz events, and Row Level Security.

The desktop uses only the publishable Supabase key. Roster changes and mastery writes go through narrow database functions that re-check the authenticated user, membership, classroom ownership, and assignment relationship. Failed mastery synchronization stays in a bounded, versioned local queue and does not erase local quiz history.

The Electron renderer receives only named preload methods. Workspace purpose, classroom IDs, assignment IDs, and request bodies are validated in the main process. Assignment context is derived from Supabase access checks rather than a renderer-provided role. See [the product modes architecture](docs/superpowers/specs/2026-07-19-product-modes-classroom-portal-design.md) for navigation, persistence, and IPC boundaries.
