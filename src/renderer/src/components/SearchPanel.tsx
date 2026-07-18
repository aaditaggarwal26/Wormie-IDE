import { useState } from 'react'
import { FileSearch, Search } from 'lucide-react'
import type { SearchResult, WorkspaceSnapshot } from '@shared/contracts'

type SearchPanelProps = {
  workspace: WorkspaceSnapshot | null
  busy: boolean
  results: SearchResult[]
  onSearch: (query: string) => void
  onOpenFile: (filePath: string, line: number) => void
}

export function SearchPanel({ workspace, busy, results, onSearch, onOpenFile }: SearchPanelProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [searched, setSearched] = useState(false)

  return (
    <aside className="side-panel search-panel">
      <div className="panel-heading"><span>Search</span><FileSearch size={15} /></div>
      <form
        className="search-form"
        onSubmit={(event) => {
          event.preventDefault()
          if (!query.trim()) return
          setSearched(true)
          onSearch(query)
        }}
      >
        <Search size={14} />
        <input
          data-workbench-focus="search"
          disabled={!workspace}
          onChange={(event) => {
            setQuery(event.target.value)
            setSearched(false)
          }}
          placeholder={workspace ? 'Search project files' : 'Open a workspace first'}
          value={query}
        />
        <kbd>Enter</kbd>
      </form>

      <div className="search-results">
        {busy && <div className="panel-message">Searching...</div>}
        {!busy && !searched && <div className="panel-message">Search file names and text across the workspace.</div>}
        {!busy && searched && results.length === 0 && <div className="panel-message">No matches found.</div>}
        {!busy && results.map((result, index) => (
          <button
            className="search-result"
            key={`${result.path}-${result.line}-${result.column}-${index}`}
            onClick={() => onOpenFile(result.path, result.line)}
            type="button"
          >
            <span className="result-path">{result.relativePath}</span>
            <span className="result-preview">{result.preview || 'Whitespace match'}</span>
            <span className="result-location">{result.line}:{result.column}</span>
          </button>
        ))}
      </div>
    </aside>
  )
}

