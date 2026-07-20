import { useEffect, useRef } from 'react'
import { Braces, X } from 'lucide-react'
import type { SafeRenameState } from '@/typescript/useSafeRename'

type SafeRenameDialogProps = {
  state: SafeRenameState
  onApply: () => void
  onClose: () => void
  onPreview: (newName: string) => void
  onSetNewName: (newName: string) => void
  onToggleFile: (filePath: string) => void
}

export function SafeRenameDialog({ state, onApply, onClose, onPreview, onSetNewName, onToggleFile }: SafeRenameDialogProps): React.JSX.Element {
  const inputRef = useRef<HTMLInputElement | null>(null)
  useEffect(() => {
    inputRef.current?.focus()
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', closeOnEscape)
    return () => window.removeEventListener('keydown', closeOnEscape)
  }, [onClose])

  const previewing = state.phase === 'preview' || state.phase === 'applying'
  return (
    <div className="modal-backdrop" role="presentation">
      <section aria-labelledby="safe-rename-title" aria-modal="true" className="safety-dialog safe-rename-dialog" role="dialog">
        <header>
          <div><Braces size={15} /><span>TypeScript intelligence</span></div>
          <button aria-label="Close rename" disabled={state.phase === 'applying'} onClick={onClose} type="button"><X size={15} /></button>
        </header>
        <div className="safe-rename-title-row">
          <div><span>Safe rename</span><h2 id="safe-rename-title">Rename {state.originalName || 'symbol'}</h2></div>
          {previewing && <b>{state.files.reduce((count, file) => count + file.edits.length, 0)} references</b>}
        </div>
        <form onSubmit={(event) => { event.preventDefault(); if (!previewing) onPreview(state.newName) }}>
          <label htmlFor="safe-rename-name">New symbol name</label>
          <input disabled={state.phase === 'loading' || state.phase === 'applying'} id="safe-rename-name" onChange={(event) => onSetNewName(event.target.value)} ref={inputRef} value={state.newName} />
        </form>
        {state.error && <pre className="safe-rename-error" role="alert">{state.error}</pre>}
        {previewing && (
          <div className="safe-rename-files">
            {state.files.map((file) => (
              <article key={file.path}>
                <label><input checked={state.selectedPaths.has(file.path)} disabled={state.phase === 'applying'} onChange={() => onToggleFile(file.path)} type="checkbox" /><span>{file.path}</span><b>{file.edits.length}</b></label>
                {file.occurrences.map((occurrence, index) => (
                  <div className="safe-rename-occurrence" key={`${occurrence.line}:${index}`}>
                    <span>{occurrence.line}</span><del>{occurrence.before}</del><ins>{occurrence.after}</ins>
                  </div>
                ))}
              </article>
            ))}
          </div>
        )}
        <footer>
          <button disabled={state.phase === 'applying'} onClick={onClose} type="button">Cancel</button>
          {previewing ? (
            <button className="primary" disabled={state.phase === 'applying' || state.selectedPaths.size === 0} onClick={onApply} type="button">{state.phase === 'applying' ? 'Applying...' : `Apply to ${state.selectedPaths.size} files`}</button>
          ) : (
            <button className="primary" disabled={state.phase === 'loading' || !state.newName.trim()} onClick={() => onPreview(state.newName)} type="button">{state.phase === 'loading' ? 'Building preview...' : 'Preview rename'}</button>
          )}
        </footer>
      </section>
    </div>
  )
}
