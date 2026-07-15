import { useEffect, useState } from 'react'
import { FolderGit2, GitBranch, RefreshCw } from 'lucide-react'
import type { GitStatusSnapshot, WorkspaceSnapshot } from '@shared/contracts'

type SourceControlPanelProps = {
  workspace: WorkspaceSnapshot | null
  status: GitStatusSnapshot | null
  busy: boolean
  onRefresh: () => void
  onOpenFile: (filePath: string) => void
}

export function SourceControlPanel({ workspace, status, busy, onRefresh, onOpenFile }: SourceControlPanelProps): React.JSX.Element {
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null)
  const repositories = status?.repositories ?? []
  const selectedRepository = repositories.find((repository) => repository.rootPath === selectedRoot) ?? repositories[0]

  useEffect(() => {
    if (!repositories.some((repository) => repository.rootPath === selectedRoot)) {
      setSelectedRoot(repositories[0]?.rootPath ?? null)
    }
  }, [status, selectedRoot])

  return (
    <aside className="side-panel source-panel">
      <div className="panel-heading">
        <span>Source Control</span>
        <button disabled={!workspace || busy} onClick={onRefresh} title="Detect repositories again" type="button">
          <RefreshCw className={busy ? 'spin' : ''} size={14} />
        </button>
      </div>

      {!workspace && <div className="panel-message">Open a workspace to detect Git repositories.</div>}
      {workspace && !status && <div className="panel-message">Detecting repositories...</div>}
      {status && repositories.length === 0 && (
        <div className="repository-empty">
          <FolderGit2 size={22} />
          <strong>No Git repositories found</strong>
          <span>Checked the workspace and nested folders up to five levels deep.</span>
        </div>
      )}

      {repositories.length > 0 && (
        <>
          <div className="repositories-heading"><span>Repositories</span><b>{repositories.length}</b></div>
          <div className="repository-list">
            {repositories.map((repository) => (
              <button
                data-active={selectedRepository?.rootPath === repository.rootPath}
                key={repository.rootPath}
                onClick={() => setSelectedRoot(repository.rootPath)}
                type="button"
              >
                <FolderGit2 size={13} />
                <span>{repository.relativePath === '.' ? repository.name : repository.relativePath}</span>
                <code>{repository.files.length}</code>
              </button>
            ))}
          </div>
        </>
      )}

      {selectedRepository && (
        <>
          <div className="branch-summary">
            <GitBranch size={14} />
            <strong>{selectedRepository.branch ?? 'Detached HEAD'}</strong>
            {(selectedRepository.ahead > 0 || selectedRepository.behind > 0) && (
              <span>{selectedRepository.ahead} up / {selectedRepository.behind} down</span>
            )}
          </div>
          <div className="changes-heading"><span>Changes</span><b>{selectedRepository.files.length}</b></div>
          <div className="change-list">
            {selectedRepository.files.length === 0 && <div className="panel-message compact">Working tree clean.</div>}
            {selectedRepository.files.map((file) => (
              <button className="change-row" key={file.path} onClick={() => onOpenFile(file.absolutePath)} type="button">
                <span>{file.path}</span>
                <code>{file.index.trim() || file.workingTree.trim() || 'M'}</code>
              </button>
            ))}
          </div>
        </>
      )}
    </aside>
  )
}

