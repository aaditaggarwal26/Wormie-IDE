import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, FileSearch, Replace, Search, X } from 'lucide-react'
import type {
  SearchOptions,
  WorkspaceReplacementFile,
  WorkspaceReplacementResponse,
  WorkspaceSearchResponse,
  WorkspaceSnapshot
} from '@shared/contracts'
import { useWorkbench } from '@/store/workbench'

type SearchPanelProps = {
  workspace: WorkspaceSnapshot | null
  onOpenFile: (filePath: string, line: number) => void
}

function globs(value: string): string[] {
  return value.split(',').map((item) => item.trim()).filter(Boolean)
}

function cleanError(error: unknown): string {
  return (error instanceof Error ? error.message : 'Search failed.')
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
    .replace(/^Error:\s*/i, '')
}

export function SearchPanel({ workspace, onOpenFile }: SearchPanelProps): React.JSX.Element {
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const [query, setQuery] = useState('')
  const [replacement, setReplacement] = useState('')
  const [showReplace, setShowReplace] = useState(false)
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [wholeWord, setWholeWord] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [includeText, setIncludeText] = useState('')
  const [excludeText, setExcludeText] = useState('')
  const [scopeActiveFolder, setScopeActiveFolder] = useState(false)
  const [response, setResponse] = useState<WorkspaceSearchResponse | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)
  const [replaceBusy, setReplaceBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [outcomes, setOutcomes] = useState<WorkspaceReplacementResponse['outcomes']>([])
  const latestRequest = useRef('')
  const requestSequence = useRef(0)
  const separator = window.desktop.platform === 'win32' ? '\\' : '/'
  const activeFolder = activePath?.slice(0, activePath.lastIndexOf(separator)) || null

  const runSearch = useCallback(async () => {
    const workspaceRoot = workspace?.rootPath
    const trimmedQuery = query.trim()
    if (!workspaceRoot || !trimmedQuery) {
      latestRequest.current = ''
      setResponse(null)
      setSelected(new Set())
      setBusy(false)
      setError(null)
      return
    }
    const requestId = `${Date.now()}:${++requestSequence.current}`
    latestRequest.current = requestId
    const options: SearchOptions = {
      requestId,
      query: trimmedQuery,
      replacement,
      caseSensitive,
      wholeWord,
      useRegex,
      includeGlobs: globs(includeText),
      excludeGlobs: globs(excludeText),
      folderPath: scopeActiveFolder ? activeFolder : null
    }
    setBusy(true)
    setError(null)
    try {
      const result = await window.desktop.searchWorkspace(options)
      if (latestRequest.current !== result.requestId || result.workspaceRoot !== useWorkbench.getState().workspace?.rootPath) return
      setResponse(result)
      setSelected(new Set(result.files.flatMap((file) => file.matches.map((match) => `${file.path}:${match.id}`))))
    } catch (searchError) {
      if (latestRequest.current === requestId) {
        setResponse(null)
        setError(cleanError(searchError))
      }
    } finally {
      if (latestRequest.current === requestId) setBusy(false)
    }
  }, [activeFolder, caseSensitive, excludeText, includeText, query, replacement, scopeActiveFolder, useRegex, wholeWord, workspace?.rootPath])

  useEffect(() => {
    const timeout = window.setTimeout(() => void runSearch(), 250)
    return () => window.clearTimeout(timeout)
  }, [runSearch])

  useEffect(() => {
    if (!activeFolder) setScopeActiveFolder(false)
  }, [activeFolder])

  const allMatchIds = useMemo(() => response?.files.flatMap((file) => file.matches.map((match) => `${file.path}:${match.id}`)) ?? [], [response])

  const applyReplacement = useCallback(async (requestedIds: Set<string>) => {
    if (!response || !workspace || requestedIds.size === 0) return
    const files: WorkspaceReplacementFile[] = response.files.flatMap((file) => {
      const matches = file.matches.filter((match) => requestedIds.has(`${file.path}:${match.id}`))
      return matches.length === 0 ? [] : [{
        filePath: file.path,
        expectedFingerprint: file.fingerprint,
        edits: matches.map((match) => ({ start: match.start, end: match.end, expectedText: match.matchText, replacement: match.replacement }))
      }]
    })
    const dirtyPaths = new Set(documents.filter((document) => document.content !== document.savedContent).map((document) => document.path))
    if (files.some((file) => dirtyPaths.has(file.filePath))) {
      setError('Save or close locally changed files before replacing their disk contents.')
      return
    }
    setReplaceBusy(true)
    setError(null)
    try {
      const result = await window.desktop.replaceWorkspace({ workspaceRoot: workspace.rootPath, files })
      if (result.workspaceRoot !== useWorkbench.getState().workspace?.rootPath) return
      setOutcomes(result.outcomes)
      await Promise.all(result.outcomes.filter((outcome) => outcome.status === 'applied').map(async (outcome) => {
        const diskFile = await window.desktop.readFile(outcome.filePath)
        const state = useWorkbench.getState()
        if (state.workspace?.rootPath !== result.workspaceRoot) return
        const document = state.documents.find((candidate) => candidate.path === outcome.filePath)
        if (!document || document.content === document.savedContent) state.replaceDocumentFromDisk(diskFile)
        else state.setExternalChange(outcome.filePath, { kind: 'changed', diskFile })
      }))
      const failures = result.outcomes.filter((outcome) => outcome.status === 'failed')
      if (failures.length > 0) setError(`${failures.length} file${failures.length === 1 ? '' : 's'} could not be changed. Review the details below.`)
      await runSearch()
    } catch (replaceError) {
      setError(cleanError(replaceError))
    } finally {
      setReplaceBusy(false)
    }
  }, [documents, response, runSearch, workspace])

  function toggleMatch(id: string): void {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <aside className="side-panel search-panel">
      <div className="panel-heading"><span>Search</span><FileSearch size={15} /></div>
      <div className="search-controls">
        <div className="search-query-row">
          <button aria-label="Toggle replacement" data-active={showReplace} onClick={() => setShowReplace((value) => !value)} title="Toggle replacement" type="button"><Replace size={13} /></button>
          <div className="search-input-wrap">
            <Search size={13} />
            <input
              data-workbench-focus="search"
              disabled={!workspace}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={workspace ? 'Search project files' : 'Open a workspace first'}
              value={query}
            />
            {query && <button aria-label="Clear search" onClick={() => setQuery('')} type="button"><X size={12} /></button>}
          </div>
        </div>
        {showReplace && (
          <div className="replace-input-row">
            <input aria-label="Replacement text" onChange={(event) => setReplacement(event.target.value)} placeholder="Replace with" value={replacement} />
            <button disabled={replaceBusy || selected.size === 0} onClick={() => void applyReplacement(selected)} title="Replace selected matches" type="button">Replace {selected.size}</button>
          </div>
        )}
        <div className="search-option-row">
          <button aria-label="Match case" aria-pressed={caseSensitive} data-active={caseSensitive} onClick={() => setCaseSensitive((value) => !value)} title="Match case" type="button">Aa</button>
          <button aria-label="Match whole word" aria-pressed={wholeWord} data-active={wholeWord} onClick={() => setWholeWord((value) => !value)} title="Match whole word" type="button">ab</button>
          <button aria-label="Use regular expression" aria-pressed={useRegex} data-active={useRegex} onClick={() => setUseRegex((value) => !value)} title="Use regular expression" type="button">.*</button>
          <button aria-pressed={scopeActiveFolder} data-active={scopeActiveFolder} disabled={!activeFolder} onClick={() => setScopeActiveFolder((value) => !value)} title={activeFolder ?? 'Open a file to search its folder'} type="button">{scopeActiveFolder ? 'File folder' : 'Workspace'}</button>
        </div>
        <details className="search-globs">
          <summary>Files to include or exclude</summary>
          <input aria-label="Files to include" onChange={(event) => setIncludeText(event.target.value)} placeholder="Include: **/*.ts, **/*.tsx" value={includeText} />
          <input aria-label="Files to exclude" onChange={(event) => setExcludeText(event.target.value)} placeholder="Exclude: **/*.test.ts" value={excludeText} />
        </details>
      </div>

      <div
        className="search-results"
        onKeyDown={(event) => {
          if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.search-match-open')]
          if (buttons.length === 0) return
          const current = buttons.indexOf(document.activeElement as HTMLButtonElement)
          const next = event.key === 'ArrowDown' ? Math.min(buttons.length - 1, current + 1) : Math.max(0, current <= 0 ? 0 : current - 1)
          buttons[next]?.focus()
          event.preventDefault()
        }}
      >
        {busy && <div className="panel-message">Searching...</div>}
        {!busy && !query.trim() && <div className="panel-message">Type to search saved text across the workspace.</div>}
        {!busy && query.trim() && !error && response?.totalMatches === 0 && <div className="panel-message">No matches found.</div>}
        {error && <div className="search-error" role="alert">{error}</div>}
        {outcomes.filter((outcome) => outcome.status === 'failed').map((outcome) => <div className="search-error-detail" key={outcome.filePath}>{outcome.filePath}: {outcome.message}</div>)}
        {response && response.totalMatches > 0 && (
          <div className="search-summary">
            <span>{response.totalMatches} matches in {response.files.length} files{response.truncated ? ' (limited)' : ''}</span>
            {showReplace && <button disabled={replaceBusy} onClick={() => void applyReplacement(new Set(allMatchIds))} type="button">Replace all</button>}
          </div>
        )}
        {response?.files.map((file) => {
          const fileIds = file.matches.map((match) => `${file.path}:${match.id}`)
          const fileSelected = fileIds.every((id) => selected.has(id))
          const isCollapsed = collapsed.has(file.path)
          return (
            <section className="search-file-group" key={file.path}>
              <div className="search-file-heading">
                {showReplace && <input aria-label={`Select matches in ${file.relativePath}`} checked={fileSelected} onChange={() => setSelected((current) => {
                  const next = new Set(current)
                  for (const id of fileIds) fileSelected ? next.delete(id) : next.add(id)
                  return next
                })} type="checkbox" />}
                <button aria-expanded={!isCollapsed} onClick={() => setCollapsed((current) => {
                  const next = new Set(current)
                  if (next.has(file.path)) next.delete(file.path)
                  else next.add(file.path)
                  return next
                })} type="button">
                  {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                  <span>{file.relativePath}</span><b>{file.matches.length}</b>
                </button>
                {showReplace && <button disabled={replaceBusy} onClick={() => void applyReplacement(new Set(fileIds))} title={`Replace all in ${file.relativePath}`} type="button"><Replace size={12} /></button>}
              </div>
              {!isCollapsed && file.matches.map((match) => {
                const id = `${file.path}:${match.id}`
                return (
                  <div className="search-match" key={match.id}>
                    {showReplace && <input aria-label={`Select match on line ${match.line}`} checked={selected.has(id)} onChange={() => toggleMatch(id)} type="checkbox" />}
                    <button className="search-match-open" onClick={() => onOpenFile(file.path, match.line)} type="button">
                      <span>{match.preview || 'Whitespace match'}</span>
                      {showReplace && <small><del>{match.matchText || 'empty match'}</del><ins>{match.replacement || 'empty replacement'}</ins></small>}
                      <b>{match.line}:{match.column}</b>
                    </button>
                    {showReplace && <button disabled={replaceBusy} onClick={() => void applyReplacement(new Set([id]))} title="Replace this match" type="button"><Replace size={11} /></button>}
                  </div>
                )
              })}
            </section>
          )
        })}
      </div>
    </aside>
  )
}
