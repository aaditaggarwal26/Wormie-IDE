import { AlertTriangle, Save } from 'lucide-react'

type Props = {
  busy: boolean
  error: string | null
  fileNames: string[]
  onCancel: () => void
  onDiscard: () => void
  onSave: () => void
}

export function DirtyFilesDialog({ busy, error, fileNames, onCancel, onDiscard, onSave }: Props): React.JSX.Element {
  return (
    <div className="modal-backdrop">
      <section aria-label="Unsaved files" aria-modal="true" className="safety-dialog" role="dialog">
        <div className="safety-dialog-heading">
          <AlertTriangle size={18} />
          <div><span>Unsaved files</span><strong>Save your work before continuing?</strong></div>
        </div>
        <ul>{fileNames.slice(0, 8).map((name) => <li key={name}>{name}</li>)}</ul>
        {fileNames.length > 8 && <p>And {fileNames.length - 8} more files.</p>}
        {error && <p className="form-error">{error}</p>}
        <div className="safety-dialog-actions">
          <button disabled={busy} onClick={onCancel} type="button">Cancel</button>
          <button disabled={busy} onClick={onDiscard} type="button">Discard changes</button>
          <button className="primary-button" disabled={busy} onClick={onSave} type="button"><Save size={13} /> {busy ? 'Saving...' : 'Save and continue'}</button>
        </div>
      </section>
    </div>
  )
}
