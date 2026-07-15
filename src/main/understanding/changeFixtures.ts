import type { ChangeInput } from '../../shared/contracts'

// Imported only by development/tests. Production handlers always analyze real proposals or staged diffs.
export const developmentChangeFixtures: Record<string, ChangeInput> = {
  smallText: { id: 'fixture:text', source: 'git_commit', title: 'Clarify README', files: [{ path: 'README.md', status: 'modified', additions: 1, deletions: 1, patch: '-Old copy\n+Clear copy' }] },
  reactState: { id: 'fixture:state', source: 'ai_proposal', title: 'Move loading ownership', files: [{ path: 'src/store/session.ts', status: 'modified', additions: 35, deletions: 18, patch: '+const useSessionStore = create(...)' }] },
  authentication: { id: 'fixture:auth', source: 'ai_proposal', title: 'Harden session cookies', files: [{ path: 'src/auth/session.ts', status: 'modified', additions: 12, deletions: 4, patch: '+cookie({ httpOnly: true, sameSite: "strict" })' }] },
  databaseMigration: { id: 'fixture:db', source: 'git_commit', title: 'Add organization ownership', files: [{ path: 'migrations/024_add_owner.sql', status: 'added', additions: 52, deletions: 0, patch: '+ALTER TABLE projects ADD COLUMN owner_id UUID;' }] },
  electronIpc: { id: 'fixture:ipc', source: 'ai_proposal', title: 'Add project metadata IPC', files: [{ path: 'src/preload/index.ts', status: 'modified', additions: 15, deletions: 1, patch: '+ipcRenderer.invoke("project:metadata")' }, { path: 'src/main/project.ts', status: 'added', additions: 24, deletions: 0, patch: '+ipcMain.handle("project:metadata", validate)' }] },
  largeRefactor: { id: 'fixture:refactor', source: 'git_commit', title: 'Split workbench services', files: Array.from({ length: 7 }, (_, index) => ({ path: `src/services/service-${index}.ts`, status: index < 3 ? 'added' as const : 'modified' as const, additions: 65, deletions: 28, patch: '+export function service() {}' })) },
  criticalFileAccess: { id: 'fixture:file', source: 'ai_proposal', title: 'Add workspace file writer', files: [{ path: 'src/preload/index.ts', status: 'modified', additions: 14, deletions: 0, patch: '+ipcRenderer.invoke("file:write", path)' }, { path: 'src/main/filesystem.ts', status: 'added', additions: 45, deletions: 0, patch: '+await fs.writeFile(validatePath(path), content)' }] }
}
