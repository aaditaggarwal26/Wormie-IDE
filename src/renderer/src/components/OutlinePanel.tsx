import { useEffect, useMemo, useState } from 'react'
import { Braces, Search } from 'lucide-react'
import * as monaco from 'monaco-editor'
import { useWorkbench } from '@/store/workbench'
import { isTypeScriptProjectFile } from '@/typescript/projectFiles'
import { workspacePathToFileUri } from '@/typescript/fileUri'
import { flattenNavigationTree, type OutlineSymbol } from '@/typescript/outlineModel'
import { withRequestTimeout } from '@/typescript/requestGuard'

export function OutlinePanel(): React.JSX.Element {
  const workspace = useWorkbench((state) => state.workspace)
  const activePath = useWorkbench((state) => state.activePath)
  const activeContent = useWorkbench((state) => state.documents.find((document) => document.path === state.activePath)?.content ?? '')
  const revealDocumentLine = useWorkbench((state) => state.revealDocumentLine)
  const [symbols, setSymbols] = useState<OutlineSymbol[]>([])
  const [query, setQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const workspaceRoot = workspace?.rootPath
    if (!workspaceRoot || !activePath || !isTypeScriptProjectFile(activePath)) {
      setSymbols([])
      setError(null)
      return
    }
    let active = true
    const timeout = window.setTimeout(() => {
      void (async () => {
        setBusy(true)
        setError(null)
        const uri = monaco.Uri.parse(workspacePathToFileUri(activePath, window.desktop.platform))
        const model = monaco.editor.getModel(uri)
        if (!model) return
        const accessor = model.getLanguageId() === 'javascript'
          ? await monaco.languages.typescript.getJavaScriptWorker()
          : await monaco.languages.typescript.getTypeScriptWorker()
        const worker = await withRequestTimeout(accessor(uri), 8_000, 'Outline request timed out.')
        const tree = await withRequestTimeout(worker.getNavigationTree(uri.toString()), 8_000, 'Outline request timed out.')
        if (!active || useWorkbench.getState().workspace?.rootPath !== workspaceRoot || useWorkbench.getState().activePath !== activePath) return
        setSymbols(tree ? flattenNavigationTree(tree, model) : [])
      })().catch((outlineError) => {
        if (active) setError(outlineError instanceof Error ? outlineError.message : 'Outline request failed.')
      }).finally(() => {
        if (active) setBusy(false)
      })
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [activeContent, activePath, workspace?.rootPath])

  const visibleSymbols = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return normalized ? symbols.filter((symbol) => `${symbol.kind} ${symbol.name}`.toLocaleLowerCase().includes(normalized)) : symbols
  }, [query, symbols])

  return (
    <aside className="side-panel outline-panel">
      <div className="panel-heading"><span>Outline</span><Braces size={15} /></div>
      <div className="outline-search"><Search size={13} /><input disabled={symbols.length === 0} onChange={(event) => setQuery(event.target.value)} placeholder="Filter symbols" value={query} /></div>
      <div className="outline-symbols">
        {busy && <div className="panel-message">Reading symbols...</div>}
        {!busy && !activePath && <div className="panel-message">Open a JavaScript or TypeScript file.</div>}
        {!busy && activePath && !isTypeScriptProjectFile(activePath) && <div className="panel-message">Outline currently supports JavaScript and TypeScript.</div>}
        {!busy && !error && isTypeScriptProjectFile(activePath ?? '') && visibleSymbols.length === 0 && <div className="panel-message">No symbols found.</div>}
        {error && <div className="search-error" role="alert">{error}</div>}
        {!busy && activePath && visibleSymbols.map((symbol) => (
          <button key={symbol.id} onClick={() => revealDocumentLine(activePath, symbol.line)} style={{ paddingLeft: 11 + symbol.depth * 12 }} type="button">
            <span>{symbol.name}</span><small>{symbol.kind}</small><b>{symbol.line}</b>
          </button>
        ))}
      </div>
    </aside>
  )
}
