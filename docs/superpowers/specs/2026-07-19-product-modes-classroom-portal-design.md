# Wormie Product Modes and Classroom Portal

## Product boundary

Wormie has three authenticated modes with explicit transitions:

- `launcher`: the stable landing screen after authentication.
- `sandbox`: the ordinary IDE. Classroom, assignment, and mastery navigation is absent, and an assignment manifest in the opened folder does not activate assignment policy.
- `classrooms`: a full-screen portal with no IDE chrome.
- `assignment`: the IDE launched from a classroom assignment or teacher draft. It exposes one assignment-context activity and no classroom roster or global mastery navigation.

Authentication remains a separate gate before these modes. The launcher is not persisted so a normal restart always returns to a clear product choice. Editor recovery and the active workspace remain independently recoverable.

## Navigation model

`src/renderer/src/navigation/applicationMode.ts` owns a small validated Zustand store. Assignment mode carries a bounded context containing classroom ID and name, assignment ID and title when published, and the authenticated user's classroom role. A monotonically increasing transition token identifies async launches. Components discard results whose token or requested mode is stale.

Leaving either IDE mode runs through the existing dirty-file policy. Entering the portal does not clear editor documents, the current workspace, or recovery data. Returning to the launcher is always explicit.

The main process separately tracks whether the active workspace is being used as `sandbox` or `assignment`. The renderer can select only those two validated values through narrow IPC. Agent assignment policy is consulted only in assignment mode, preventing a manifest found in a sandbox folder from silently attaching educational policy.

## Renderer boundaries

- `WormieLauncher` renders the two primary destinations and no workbench.
- `ClassroomPortal` owns the full-screen classroom information architecture: grouped classroom navigation and Assignments, People, Mastery, and teacher Settings tabs.
- `ActivityRail` contains only IDE activities. It receives an assignment-mode flag and adds one assignment-context entry only in that mode.
- `AssignmentPanel` remains the focused assignment context inside Assignment IDE mode. Classroom browsing, invites, people, and mastery never render there.
- `App` coordinates authentication, mode transitions, existing workspace mutations, and cloud operations. New portal presentation and navigation state live outside `App`.

The portal follows Wormie's restrained industrial-editorial design: near-black surfaces, olive learning accents, warm teacher accents, strong serif section titles, clear grouped navigation, and generous space. It does not stretch the former narrow sidebar across the screen.

## Classroom and roster services

The existing Supabase client remains in the Electron main process. New IPC methods stay narrow and validate UUIDs and request bodies with Zod.

Roster changes use security-definer database functions:

- `add_classroom_student_by_email` normalizes one email, verifies that the caller owns the classroom, and returns a generic result without exposing account search.
- `remove_classroom_student` removes only a student and rejects the owner or teacher records.
- `leave_classroom` removes only the caller's student membership.
- `classroom_member_emails` returns all member emails to the owner, but only the caller and teachers to a student.

Invite links remain the primary addition flow. Direct email addition is an explicit teacher action, not a searchable user directory.

## Classroom-scoped mastery

Local understanding data migrates from schema version 1 to schema version 2. Settings remain global, while gates, history, mastery, and audit events are stored in named scopes. Existing data migrates into `global`; classroom work uses `classroom:<uuid>`.

Sandbox IDE always selects `global`. Opening a classroom assignment selects its classroom scope after membership and assignment access have been validated in the main process. Returning to Sandbox selects `global`.

Supabase receives two additive tables:

- `classroom_mastery`: the current concept snapshot per classroom and student.
- `classroom_mastery_events`: bounded completed quiz evidence, optionally linked to a published assignment.

Students can select and write only their own rows while they are classroom members. Classroom owners can read student rows in their classrooms. Users outside the classroom have no access. The desktop never uses a service-role key.

After a classroom-scoped understanding result changes local history, the main process attempts to synchronize the trusted local overview. A failed network sync does not roll back the quiz or gate. The failure is retained as a bounded pending synchronization entry and retried when classroom data is refreshed.

## Assignment launch

Opening a published classroom assignment keeps the existing package download, size bound, SHA-256 verification, safe import, and workspace setup. The result now includes validated classroom and assignment context. The renderer enters Assignment IDE mode only after the import and workspace transition complete and only if its transition token is current.

Teachers create a draft from the classroom portal by choosing a local workspace. This enters Assignment IDE mode with teacher context. Existing manifest editing, export, publishing, and submission-review controls remain in the focused assignment panel.

Returning to the classroom is guarded by dirty-file handling and returns to the originating classroom and tab.

## Persistence and stale work

- Navigation persistence is versioned and limited to safe portal selection preferences. The active application mode is not restored automatically.
- Existing editor recovery remains workspace keyed.
- Every portal request captures the authenticated user ID and a request generation. Sign-out or mode changes invalidate the generation.
- Assignment launch responses carry the server-validated classroom context and are ignored when stale.
- Workspace-mode IPC is updated before agent or assignment actions are enabled.

## Migration and rollout

The Supabase migration is additive. It does not drop or rewrite existing classroom, assignment, invite, or storage objects. The checked-in migration is reviewed and tested before remote application. Remote application requires an authenticated Supabase MCP connection; if unavailable, code delivery remains blocked from being declared fully deployed.

## Milestones

1. Add the typed navigation model, launcher, mode-aware IDE shell, and sandbox isolation.
2. Replace the classroom sidebar with the dedicated portal and grouped classroom navigation.
3. Add assignment-mode launch and return flow while preserving dirty-file and package safety.
4. Add secure roster APIs, SQL functions, portal controls, and permission tests.
5. Add scoped local understanding storage, cloud mastery synchronization, SQL policies, and portal mastery views.
6. Remove obsolete educational activity routes, verify accessibility and stale-response behavior, apply the migration, and run complete verification.

Each milestone receives focused tests, the complete test suite, TypeScript typechecking, a production build, one critical correctness/security self-review, and a separate commit.
