import { useEffect, useMemo, useState } from 'react'
import type { WorkspaceFileEntry, WorkspaceSnapshot } from '@shared/contracts'
import { rankFiles } from '@/commands/fuzzy'
import { isCurrentWorkspaceResponse } from '@/commands/workspaceResponse'
import { WorkbenchPicker, type WorkbenchPickerItem } from './WorkbenchPicker'

type Props = {
  onClose: () => void
  onOpenFile: (filePath: string) => void
  onRecentFile: (filePath: string) => void
  recentFiles: string[]
  workspace: WorkspaceSnapshot
}

export function QuickOpen({ onClose, onOpenFile, onRecentFile, recentFiles, workspace }: Props): React.JSX.Element {
  const [files, setFiles] = useState<WorkspaceFileEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [truncated, setTruncated] = useState(false)

  useEffect(() => {
    let active = true
    const workspaceRoot = workspace.rootPath
    setLoading(true)
    void window.desktop.listWorkspaceFiles().then((result) => {
      if (!active || !isCurrentWorkspaceResponse(workspaceRoot, result.workspaceRoot)) return
      setFiles(result.files)
      setTruncated(result.truncated)
      setError(null)
    }).catch((reason) => {
      if (active) setError(reason instanceof Error ? reason.message : 'Could not index workspace files.')
    }).finally(() => {
      if (active) setLoading(false)
    })
    return () => { active = false }
  }, [workspace.rootPath])

  const ranked = useMemo(() => {
    if (query.trim()) return rankFiles(query, files)
    const byPath = new Map(files.map((file) => [file.path, file]))
    const recent = recentFiles.flatMap((filePath) => {
      const file = byPath.get(filePath)
      return file ? [{ file, matchIndexes: [], score: 0 }] : []
    })
    return recent.length > 0 ? recent : files.slice(0, 100).map((file) => ({ file, matchIndexes: [], score: 0 }))
  }, [files, query, recentFiles])

  const items: WorkbenchPickerItem[] = ranked.slice(0, 200).map(({ file, matchIndexes }) => ({
    id: file.path,
    label: file.name,
    description: file.relativePath,
    matchIndexes
  }))

  return (
    <WorkbenchPicker
      ariaLabel="Quick Open"
      emptyMessage={error ?? 'No matching project files.'}
      footer={truncated ? 'Showing matches from the first 50,000 indexed files.' : query ? `${items.length} matching files` : 'Recently opened files'}
      items={items}
      loading={loading}
      onClose={onClose}
      onQueryChange={setQuery}
      onSelect={(item) => {
        onRecentFile(item.id)
        onOpenFile(item.id)
        onClose()
      }}
      placeholder="Search files by name"
      query={query}
    />
  )
}
