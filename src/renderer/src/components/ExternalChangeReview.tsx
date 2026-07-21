import { DiffEditor } from '@monaco-editor/react'
import type { EditorDocument, ExternalFileChange } from '@/store/workbench'
import { configureEditor } from './EditorPane'

type Props = {
  change: ExternalFileChange
  document: EditorDocument
  onCloseEditor: () => void
  onKeepLocal: () => void
  onReload: () => void
}

export function ExternalChangeReview({ change, document, onCloseEditor, onKeepLocal, onReload }: Props): React.JSX.Element {
  return (
    <div className="modal-backdrop">
      <section aria-label="File changed on disk" aria-modal="true" className="external-change-dialog" role="dialog">
        <div className="external-change-copy">
          <span>External file change</span>
          <strong>{document.name}</strong>
          <p>{change.kind === 'deleted'
            ? 'This file was deleted outside Wormie. Your local editor text has not been changed.'
            : 'This file changed outside Wormie while local edits were unsaved. Choose which version to keep.'}</p>
        </div>
        {change.diskFile && (
          <div className="external-diff">
            <DiffEditor
              beforeMount={configureEditor}
              modified={document.content}
              original={change.diskFile.content}
              options={{ automaticLayout: true, readOnly: true, renderSideBySide: true, minimap: { enabled: false } }}
              theme="wormie-dark"
            />
          </div>
        )}
        <div className="safety-dialog-actions">
          {change.kind === 'deleted' && <button onClick={onCloseEditor} type="button">Close editor</button>}
          {change.diskFile && <button onClick={onReload} type="button">Reload from disk</button>}
          <button className="primary-button" onClick={onKeepLocal} type="button">Keep local version</button>
        </div>
      </section>
    </div>
  )
}
