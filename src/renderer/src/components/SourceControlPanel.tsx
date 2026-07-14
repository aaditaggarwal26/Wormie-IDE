import { GitBranch, RefreshCw } from 'lucide-react'
import type { GitStatusSnapshot, WorkspaceSnapshot } from '@shared/contracts'

type SourceControlPanelProps = {
  workspace: WorkspaceSnapshot | null
  status: GitStatusSnapshot | null
  busy: boolean
  onRefresh: () => void
  onOpenFile: (filePath: string) => void
}

export function SourceControlPanel({ workspace, status, busy, onRefresh, onOpenFile }: SourceControlPanelProps): React.JSX.Element {
  return (
    <aside className="side-panel source-panel">
      <div className="panel-heading">
        <span>Source Control</span>
        <button disabled={!workspace || busy} onClick={onRefresh} title="Refresh Git status" type="button">
          <RefreshCw className={busy ? 'spin' : ''} size={14} />
        </button>
      </div>

      {!workspace && <div className="panel-message">Open a workspace to inspect source control.</div>}
      {workspace && !status && <div className="panel-message">Loading repository status...</div>}
      {status && !status.isRepository && <div className="panel-message">This workspace is not a Git repository.</div>}
      {status?.isRepository && (
        <>
          <div className="branch-summary">
            <GitBranch size={14} />
            <strong>{status.branch ?? 'Detached HEAD'}</strong>
            {(status.ahead > 0 || status.behind > 0) && <span>{status.ahead} up / {status.behind} down</span>}
          </div>
          <div className="changes-heading"><span>Changes</span><b>{status.files.length}</b></div>
          <div className="change-list">
            {status.files.length === 0 && <div className="panel-message compact">Working tree clean.</div>}
            {status.files.map((file) => (
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

