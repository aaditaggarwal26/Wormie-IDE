import { useState } from 'react'
import { ChevronRight, File, FileCode2, Folder, FolderOpen, FolderPlus } from 'lucide-react'
import type { FileTreeNode, WorkspaceSnapshot } from '@shared/contracts'

type ExplorerProps = {
  workspace: WorkspaceSnapshot | null
  busy: boolean
  onOpenWorkspace: () => void
  onOpenFile: (filePath: string) => void
}

function TreeNode({ node, depth, onOpenFile }: { node: FileTreeNode; depth: number; onOpenFile: (path: string) => void }) {
  const [expanded, setExpanded] = useState(depth === 0)

  if (node.type === 'directory') {
    return (
      <li>
        <button
          className="tree-row"
          onClick={() => setExpanded((value) => !value)}
          style={{ paddingLeft: 10 + depth * 13 }}
          type="button"
        >
          <ChevronRight className="tree-chevron" data-expanded={expanded} size={13} />
          {expanded ? <FolderOpen className="folder-icon" size={15} /> : <Folder className="folder-icon" size={15} />}
          <span>{node.name}</span>
        </button>
        {expanded && node.children && (
          <ul>
            {node.children.map((child) => (
              <TreeNode key={child.path} node={child} depth={depth + 1} onOpenFile={onOpenFile} />
            ))}
          </ul>
        )}
      </li>
    )
  }

  const CodeIcon = /\.(tsx?|jsx?|css|html|json|py|rs|go)$/i.test(node.name) ? FileCode2 : File
  return (
    <li>
      <button
        className="tree-row file-row"
        onClick={() => onOpenFile(node.path)}
        style={{ paddingLeft: 25 + depth * 13 }}
        type="button"
      >
        <CodeIcon className="file-icon" size={14} />
        <span>{node.name}</span>
      </button>
    </li>
  )
}

export function Explorer({ workspace, busy, onOpenWorkspace, onOpenFile }: ExplorerProps): React.JSX.Element {
  return (
    <aside className="side-panel">
      <div className="panel-heading">
        <span>Explorer</span>
        <button onClick={onOpenWorkspace} title="Open folder" type="button">
          <FolderPlus size={15} />
        </button>
      </div>

      {workspace ? (
        <div className="tree-wrap">
          <div className="workspace-label">
            <ChevronRight size={13} className="workspace-chevron" />
            <span>{workspace.name}</span>
          </div>
          <ul className="file-tree">
            {workspace.entries.map((entry) => (
              <TreeNode key={entry.path} node={entry} depth={0} onOpenFile={onOpenFile} />
            ))}
          </ul>
          {workspace.truncated && <p className="tree-notice">Showing the first 5,000 entries.</p>}
        </div>
      ) : (
        <div className="panel-empty">
          <div className="empty-glyph"><FolderOpen size={20} /></div>
          <p>Bring a codebase into the workbench.</p>
          <button className="primary-button" disabled={busy} onClick={onOpenWorkspace} type="button">
            {busy ? 'Opening...' : 'Open folder'}
          </button>
        </div>
      )}
    </aside>
  )
}

