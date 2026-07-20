import { useEffect, useState } from 'react'
import {
  ChevronRight,
  File,
  FileCode2,
  FilePlus2,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  RefreshCw,
  Trash2
} from 'lucide-react'
import type { FileTreeNode, WorkspaceSnapshot } from '@shared/contracts'

type SelectedEntry = Pick<FileTreeNode, 'name' | 'path' | 'type'>
type PendingAction = { kind: 'file' | 'directory' | 'rename'; parentPath?: string }

type ExplorerProps = {
  activePath: string | null
  workspace: WorkspaceSnapshot | null
  busy: boolean
  onOpenWorkspace: () => void
  onOpenFile: (filePath: string) => void
  onCreate: (parentPath: string, name: string, type: 'file' | 'directory') => void
  onRename: (entryPath: string, name: string) => void
  onDelete: (entryPath: string) => void
  onRefresh: () => void
}

type TreeNodeProps = {
  node: FileTreeNode
  depth: number
  selectedPath: string | null
  onSelect: (entry: SelectedEntry) => void
  onOpenFile: (path: string) => void
  revealPath: string | null
}

function TreeNode({ node, depth, selectedPath, onSelect, onOpenFile, revealPath }: TreeNodeProps) {
  const [expanded, setExpanded] = useState(depth === 0)

  useEffect(() => {
    if (!revealPath) return
    const normalizedNode = node.path.toLocaleLowerCase()
    const normalizedReveal = revealPath.toLocaleLowerCase()
    if (normalizedReveal === normalizedNode || normalizedReveal.startsWith(`${normalizedNode}/`) || normalizedReveal.startsWith(`${normalizedNode}\\`)) {
      setExpanded(true)
    }
  }, [node.path, revealPath])

  if (node.type === 'directory') {
    return (
      <li>
        <button
          className="tree-row"
          data-selected={selectedPath === node.path}
          onClick={() => {
            onSelect(node)
            setExpanded((value) => !value)
          }}
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
              <TreeNode
                depth={depth + 1}
                key={child.path}
                node={child}
                onOpenFile={onOpenFile}
                onSelect={onSelect}
                revealPath={revealPath}
                selectedPath={selectedPath}
              />
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
        data-entry-path={node.path}
        data-selected={selectedPath === node.path}
        onClick={() => {
          onSelect(node)
          onOpenFile(node.path)
        }}
        style={{ paddingLeft: 25 + depth * 13 }}
        type="button"
      >
        <CodeIcon className="file-icon" size={14} />
        <span>{node.name}</span>
      </button>
    </li>
  )
}

export function Explorer({
  activePath,
  workspace,
  busy,
  onOpenWorkspace,
  onOpenFile,
  onCreate,
  onRename,
  onDelete,
  onRefresh
}: ExplorerProps): React.JSX.Element {
  const [selected, setSelected] = useState<SelectedEntry | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const [name, setName] = useState('')

  useEffect(() => {
    setSelected(null)
    setPendingAction(null)
  }, [workspace?.rootPath])

  useEffect(() => {
    if (!activePath || !workspace) return
    const findFile = (nodes: FileTreeNode[]): FileTreeNode | null => {
      for (const node of nodes) {
        if (node.path === activePath) return node
        if (node.children) {
          const match = findFile(node.children)
          if (match) return match
        }
      }
      return null
    }
    const file = findFile(workspace.entries)
    if (!file) return
    setSelected(file)
    requestAnimationFrame(() => {
      const rows = document.querySelectorAll<HTMLElement>('[data-entry-path]')
      ;[...rows].find((row) => row.dataset.entryPath === activePath)?.scrollIntoView({ block: 'nearest' })
    })
  }, [activePath, workspace])

  const beginCreate = (kind: 'file' | 'directory') => {
    if (!workspace) return
    const parentPath = selected?.type === 'directory'
      ? selected.path
      : selected
        ? selected.path.replace(/[\\/][^\\/]+$/, '')
        : workspace.rootPath
    setName('')
    setPendingAction({ kind, parentPath })
  }

  const beginRename = () => {
    if (!selected || selected.path === workspace?.rootPath) return
    setName(selected.name)
    setPendingAction({ kind: 'rename' })
  }

  const submitAction = () => {
    if (!pendingAction || !name.trim()) return
    if (pendingAction.kind === 'rename' && selected) onRename(selected.path, name)
    if (pendingAction.kind !== 'rename' && pendingAction.parentPath) {
      onCreate(pendingAction.parentPath, name, pendingAction.kind)
    }
    setPendingAction(null)
    setName('')
  }

  return (
    <aside className="side-panel" data-workbench-focus="explorer" tabIndex={-1}>
      <div className="panel-heading explorer-heading">
        <span>Explorer</span>
        <div className="panel-actions">
          <button disabled={!workspace || busy} onClick={() => beginCreate('file')} title="New file" type="button"><FilePlus2 size={14} /></button>
          <button disabled={!workspace || busy} onClick={() => beginCreate('directory')} title="New folder" type="button"><FolderPlus size={14} /></button>
          <button disabled={!selected || selected.path === workspace?.rootPath || busy} onClick={beginRename} title="Rename" type="button"><Pencil size={13} /></button>
          <button disabled={!selected || selected.path === workspace?.rootPath || busy} onClick={() => selected && onDelete(selected.path)} title="Delete" type="button"><Trash2 size={13} /></button>
          <button disabled={!workspace || busy} onClick={onRefresh} title="Refresh" type="button"><RefreshCw size={13} /></button>
        </div>
      </div>

      {workspace ? (
        <div className="tree-wrap">
          <button
            className="workspace-label"
            data-selected={selected?.path === workspace.rootPath}
            onClick={() => setSelected({ name: workspace.name, path: workspace.rootPath, type: 'directory' })}
            type="button"
          >
            <ChevronRight size={13} className="workspace-chevron" />
            <span>{workspace.name}</span>
          </button>

          {pendingAction && (
            <form
              className="entry-form"
              onSubmit={(event) => {
                event.preventDefault()
                submitAction()
              }}
            >
              {pendingAction.kind === 'directory' ? <Folder size={14} /> : <File size={14} />}
              <input
                autoFocus
                onChange={(event) => setName(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') setPendingAction(null)
                }}
                placeholder={pendingAction.kind === 'rename' ? 'New name' : `${pendingAction.kind} name`}
                value={name}
              />
            </form>
          )}

          <ul className="file-tree">
            {workspace.entries.map((entry) => (
              <TreeNode
                depth={0}
                key={entry.path}
                node={entry}
                onOpenFile={onOpenFile}
                onSelect={setSelected}
                revealPath={activePath}
                selectedPath={selected?.path ?? null}
              />
            ))}
          </ul>
          {workspace.truncated && <p className="tree-notice">Showing the first 5,000 entries.</p>}
          {/* Outline section intentionally disabled. */}
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
