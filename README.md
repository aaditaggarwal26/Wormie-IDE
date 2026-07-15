# Wormie IDE

Wormie is an Electron desktop IDE built around one rule: understand first, generate second.

## Run locally

```powershell
npm install
npm run dev
```

Use `npm run build` for a production build and `npm run dist` to create the desktop installer.

## Local assignment workflow

1. A teacher opens a starter project, chooses Assignments, creates the brief and tasks, sets the AI and evidence policies, and exports a `*.wormie-package.json` file.
2. A student chooses Import assignment package. Wormie creates an isolated student copy, records explicit local evidence consent, and tracks task progress outside the repository.
3. The assignment AI policy is enforced by the Electron main process. Learning sessions, quizzes, proposals, and applied changes are recorded only when the student accepted AI evidence collection.
4. After every task is complete, the student saves a `*.wormie-submission.json` file outside the project.
5. The teacher opens the original assignment and chooses Open student submission to review progress, AI-use evidence, and final task files.

Packages and submissions are integrity checked but are not cryptographically signed. See [docs/ASSIGNMENT_FORMAT.md](docs/ASSIGNMENT_FORMAT.md) for schemas, limits, privacy behavior, and the hosted-service migration boundary.
