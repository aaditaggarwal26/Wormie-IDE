import {
  CheckCircle2,
  Circle,
  CircleStop,
  FileCode2,
  LoaderCircle,
  TerminalSquare,
  XCircle
} from 'lucide-react'
import type { AgentActivityEvent, AgentActivityFile } from '@shared/contracts'
import type { AgentActivityViewState } from './agentActivityModel'

type AgentActivityProps = {
  state: AgentActivityViewState | null
  canOpenProposed: boolean
  onOpenProposedFile: (relativePath: string) => void
  onOpenAppliedFile: (absolutePath: string) => void
}

function StateIcon({ event }: { event: AgentActivityEvent }): React.JSX.Element {
  if (event.state === 'completed') return <CheckCircle2 size={12} />
  if (event.state === 'failed') return <XCircle size={12} />
  if (event.state === 'stopped') return <CircleStop size={12} />
  if (event.state === 'active') return <LoaderCircle className="spin" size={12} />
  return <Circle size={12} />
}

function FileGroup({
  files,
  label,
  disabled,
  onOpen
}: {
  files: AgentActivityFile[]
  label: string
  disabled?: boolean
  onOpen: (path: string) => void
}): React.JSX.Element | null {
  if (files.length === 0) return null
  return (
    <div className="activity-files">
      <b>{label}</b>
      {files.map((file) => (
        <button disabled={disabled} key={`${file.action}:${file.path}`} onClick={() => onOpen(file.path)} title={file.path} type="button">
          <FileCode2 size={11} />
          <span>{file.path.split(/[\\/]/).at(-1) ?? file.path}</span>
          <em>{file.action}</em>
        </button>
      ))}
    </div>
  )
}

export function AgentActivity({ state, canOpenProposed, onOpenProposedFile, onOpenAppliedFile }: AgentActivityProps): React.JSX.Element {
  const latest = state?.phases.at(-1)
  return (
    <section aria-label="Agent activity" className="agent-activity" id="agent-activity">
      <div className="activity-title">
        <span>Work trace</span>
        <b>{latest?.state ?? 'idle'}</b>
      </div>
      {!state || state.phases.length === 0 ? (
        <p className="activity-empty">Activity will appear when the agent starts working.</p>
      ) : (
        <ol aria-live="polite" className="activity-trace">
          {state.phases.map((event) => (
            <li data-state={event.state} key={event.phase} title={event.detail}>
              <span className="activity-marker"><StateIcon event={event} /></span>
              <div><b>{event.label}</b></div>
            </li>
          ))}
        </ol>
      )}
      <FileGroup
        disabled={!canOpenProposed}
        files={state?.files.proposal ?? []}
        label="Proposed files"
        onOpen={onOpenProposedFile}
      />
      <FileGroup files={state?.files.apply ?? []} label="Changed files" onOpen={onOpenAppliedFile} />
      <details className="activity-technical">
        <summary><TerminalSquare size={11} /> Technical log <span>{state?.technical.length ?? 0}</span></summary>
        <div>
          {(state?.technical.length ?? 0) === 0 && <p>No protocol events yet.</p>}
          {state?.technical.map((event) => (
            <code key={event.id}>
              <time>{new Date(event.timestamp).toLocaleTimeString([], { hour12: false })}</time>
              <b>{event.protocolMethod ?? event.kind}</b>
              <span>{event.detail ?? event.state}</span>
            </code>
          ))}
        </div>
      </details>
    </section>
  )
}
