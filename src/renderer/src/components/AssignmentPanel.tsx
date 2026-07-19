import { useEffect, useState } from 'react'
import { Bot, Braces, ClipboardCheck, Eye, FileJson2, FolderInput, PackageOpen, PencilLine, Play, Plus, Save, ShieldCheck, Upload, UserRound, Wrench } from 'lucide-react'
import type {
  AssignmentTask,
  AssignmentEvidencePolicy,
  AssignmentTaskProgress,
  AssignmentTaskProgressUpdate,
  AssignmentSubmission,
  AssignmentWorkspaceState,
  WorkspaceSnapshot
} from '@shared/contracts'

type AssignmentPanelProps = {
  workspace: WorkspaceSnapshot | null
  assignment: AssignmentWorkspaceState | null
  busy: boolean
  exporting: boolean
  importing: boolean
  openingSubmission: boolean
  submitting: boolean
  progressBusy: boolean
  error: string | null
  progressError: string | null
  onEdit: () => void
  onExport: () => void
  onImport: () => void
  onOpenTask: (task: AssignmentTask) => void
  onOpenSubmission: () => void
  onRecover: () => void
  onReveal: () => void
  onStart: (studentName: string, evidenceConsent: AssignmentEvidencePolicy) => void
  onUpdateTask: (update: AssignmentTaskProgressUpdate) => void
  onSubmit: () => void
  reviewedSubmission: AssignmentSubmission | null
}

export function AssignmentPanel(props: AssignmentPanelProps): React.JSX.Element {
  const { workspace, assignment, busy, error } = props
  const manifest = assignment?.manifest
  const studentOnly = assignment?.role === 'student'
  const [view, setView] = useState<'student' | 'teacher'>(studentOnly || assignment?.progress ? 'student' : 'teacher')

  useEffect(() => {
    if (studentOnly || assignment?.progress) setView('student')
  }, [assignment?.progress?.student.id, studentOnly])

  return (
    <aside className="side-panel assignment-panel">
      <div className="panel-heading">
        <span>Assignments</span>
        <button disabled={!workspace || busy || Boolean(error) || studentOnly} onClick={props.onEdit} title={manifest ? 'Edit assignment' : 'Create assignment'} type="button">
          {manifest ? <PencilLine size={14} /> : <Plus size={15} />}
        </button>
      </div>

      {!workspace && (
        <div className="assignment-empty">
          <div className="assignment-seal"><FolderInput size={18} /></div>
          <h3>Open an assignment</h3>
          <p>Packages are local and unsigned.</p>
          <button className="assignment-create-button" disabled={props.importing} onClick={props.onImport} type="button"><FolderInput size={14} /> {props.importing ? 'Importing...' : 'Import package'}</button>
        </div>
      )}

      {workspace && busy && <div className="assignment-loading">Reading assignment manifest...</div>}

      {workspace && !busy && error && (
        <div className="assignment-error-card">
          <strong>Manifest needs attention</strong><p>{error}</p>
          <div className="assignment-error-actions">
            <button onClick={props.onReveal} type="button"><Eye size={12} /> Reveal file</button>
            <button onClick={props.onRecover} type="button"><Wrench size={12} /> Back up and replace</button>
          </div>
        </div>
      )}

      {workspace && !busy && !error && !manifest && (
        <div className="assignment-empty">
          <div className="assignment-seal"><Braces size={18} /></div>
          <h3>No assignment</h3>
          <button className="assignment-create-button" onClick={props.onEdit} type="button"><Plus size={14} /> Create assignment</button>
        </div>
      )}

      {manifest && (
        <div className="assignment-summary-scroll">
          {!studentOnly && <div className="assignment-view-switch" role="tablist" aria-label="Assignment role">
            <button aria-selected={view === 'student'} onClick={() => setView('student')} role="tab" type="button">Student</button>
            <button aria-selected={view === 'teacher'} onClick={() => setView('teacher')} role="tab" type="button">Teacher</button>
          </div>}
          {view === 'student' ? <StudentView {...props} /> : <TeacherView {...props} />}
        </div>
      )}
    </aside>
  )
}

function TeacherView({ assignment, exporting, openingSubmission, onEdit, onExport, onOpenSubmission, onReveal, reviewedSubmission }: AssignmentPanelProps): React.JSX.Element | null {
  const manifest = assignment?.manifest
  if (!manifest) return null
  return <>
    <section className="assignment-summary-card">
      <span className="assignment-overline">Teacher draft</span><h3>{manifest.title}</h3><p>{manifest.summary}</p>
      <div className="assignment-stats"><span><b>{manifest.tasks.length}</b> tasks</span><span><b>{manifest.aiPolicy.passingScore}%</b> gate</span></div>
    </section>
    <div className="assignment-policy-strip"><ShieldCheck size={13} /><span>{manifest.aiPolicy.mode === 'disabled' ? 'AI disabled' : 'Learning gate enforced'}</span></div>
    <div className="assignment-task-list">
      <div className="assignment-list-heading"><span>Student work</span><b>{manifest.tasks.length}</b></div>
      {manifest.tasks.map((task, index) => <div className="assignment-task-row" key={task.id}><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{task.title}</strong><code>{task.filePath}</code></div><em>{task.kind}</em></div>)}
    </div>
    <section className="assignment-publish-card"><FileJson2 size={17} /><div><strong>Ready to distribute</strong><p>Export the package or commit the manifest.</p></div></section>
    <div className="assignment-panel-actions"><button onClick={onEdit} type="button"><PencilLine size={13} /> Edit</button><button onClick={onReveal} type="button"><Eye size={13} /> Reveal</button><button disabled={exporting} onClick={onExport} type="button"><PackageOpen size={13} /> {exporting ? 'Exporting' : 'Export'}</button></div>
    <button className="assignment-open-submission" disabled={openingSubmission} onClick={onOpenSubmission} type="button"><Upload size={13} /> {openingSubmission ? 'Opening...' : 'Open student submission'}</button>
    {reviewedSubmission && <SubmissionReview submission={reviewedSubmission} />}
  </>
}

function SubmissionReview({ submission }: { submission: AssignmentSubmission }): React.JSX.Element {
  const [selectedPath, setSelectedPath] = useState(submission.files[0]?.path ?? '')
  const selectedFile = submission.files.find((file) => file.path === selectedPath)
  let content = ''
  if (selectedFile) {
    try {
      const bytes = Uint8Array.from(atob(selectedFile.contentBase64), (character) => character.charCodeAt(0))
      content = new TextDecoder().decode(bytes)
    } catch {
      content = 'This snapshot could not be displayed as UTF-8 text.'
    }
  }
  return <section className="submission-review">
    <span className="assignment-overline">Integrity-checked submission</span>
    <h4>{submission.student.name}</h4>
    <p>Submitted {new Date(submission.submittedAt).toLocaleString()} with {submission.aiActivity.length} AI evidence events and {submission.files.length} file snapshots. Local submissions are not cryptographically signed.</p>
    {submission.aiActivity.length > 0 && <div className="submission-activity"><Bot size={13} /><span>{submission.aiActivity.filter((event) => event.type === 'quiz').length} quizzes, {submission.aiActivity.filter((event) => event.type === 'proposal').length} proposals, {submission.aiActivity.filter((event) => event.type === 'apply' && event.applied).length} applied changes</span></div>}
    {submission.files.length > 0 && <>
      <select aria-label="Submission file" onChange={(event) => setSelectedPath(event.target.value)} value={selectedPath}>{submission.files.map((file) => <option key={file.path} value={file.path}>{file.path}</option>)}</select>
      <pre>{content}</pre>
    </>}
  </section>
}

function StudentView(props: AssignmentPanelProps): React.JSX.Element | null {
  const manifest = props.assignment?.manifest
  const progress = props.assignment?.progress
  const [studentName, setStudentName] = useState('')
  const [consented, setConsented] = useState(false)
  if (!manifest) return null
  if (props.assignment?.progressError || props.progressError) return <div className="assignment-error-card" role="alert"><strong>Progress needs attention</strong><p>{props.progressError ?? props.assignment?.progressError}</p><p>Your private progress is stored in Wormie's application data, outside the project and Git repository.</p></div>
  if (!progress) return <>
    <section className="assignment-summary-card student-brief-card">
      <span className="assignment-overline">Student assignment</span><h3>{manifest.title}</h3><p>{manifest.summary}</p>
      <div className="student-instructions">{manifest.instructions}</div>
    </section>
    <section className="evidence-disclosure"><ShieldCheck size={15} /><div><strong>Evidence requested for teacher review</strong><p>{manifest.evidencePolicy.includeAiActivity ? 'AI requests, lessons, quiz scores, and applied proposals' : 'No AI activity'}; {manifest.evidencePolicy.includeFileSnapshots ? 'task-file snapshots at submission' : 'no file snapshots'}. Your consent and progress are stored locally. Nothing is sent until you explicitly submit.</p></div></section>
    <div className="student-enrollment">
      <label><span>Student name</span><input maxLength={100} onChange={(event) => setStudentName(event.target.value)} placeholder="Ada Student" value={studentName} /></label>
      <label className="student-consent"><input checked={consented} onChange={(event) => setConsented(event.target.checked)} type="checkbox" /><span>I consent to locally record the evidence categories listed above for this assignment.</span></label>
      <button className="assignment-start-button" disabled={props.progressBusy || !studentName.trim() || !consented} onClick={() => props.onStart(studentName, manifest.evidencePolicy)} type="button"><Play size={14} /> {props.progressBusy ? 'Starting...' : 'Start assignment'}</button>
    </div>
  </>
  const completed = Object.values(progress.tasks).filter((task) => task.status === 'completed').length
  const submitted = progress.status === 'submitted'
  return <>
    <section className="student-progress-card"><UserRound size={16} /><div><span>{submitted ? 'Submitted by' : 'Working as'}</span><strong>{progress.student.name}</strong></div><b aria-label={`${completed} of ${manifest.tasks.length} tasks completed`}>{completed}/{manifest.tasks.length}</b></section>
    <div className="assignment-task-list student-task-list">
      {manifest.tasks.map((task, index) => <StudentTask key={task.id} task={task} index={index} progress={progress.tasks[task.id]} busy={props.progressBusy || submitted} onOpen={() => props.onOpenTask(task)} onUpdate={props.onUpdateTask} />)}
    </div>
    {submitted
      ? <section className="submission-complete" role="status"><ClipboardCheck size={16} /><div><strong>Submission saved</strong><p>This local assignment is now read-only.</p></div></section>
      : <button className="assignment-submit-button" disabled={props.submitting || completed !== manifest.tasks.length} onClick={props.onSubmit} type="button"><Upload size={14} /> {props.submitting ? 'Preparing submission...' : completed === manifest.tasks.length ? 'Review and save submission' : `Complete ${manifest.tasks.length - completed} more task${manifest.tasks.length - completed === 1 ? '' : 's'}`}</button>}
  </>
}

function StudentTask({ task, index, progress, busy, onOpen, onUpdate }: {
  task: AssignmentTask
  index: number
  progress: AssignmentTaskProgress
  busy: boolean
  onOpen: () => void
  onUpdate: (update: AssignmentTaskProgressUpdate) => void
}): React.JSX.Element {
  const [status, setStatus] = useState(progress.status)
  const [notes, setNotes] = useState(progress.notes)
  useEffect(() => { setStatus(progress.status); setNotes(progress.notes) }, [progress.updatedAt])
  const dirty = status !== progress.status || notes.trim() !== progress.notes
  return <article className="student-task-card" data-status={status}>
    <button className="student-task-title" onClick={onOpen} type="button"><span>{String(index + 1).padStart(2, '0')}</span><div><strong>{task.title}</strong><code>{task.filePath}</code></div></button>
    <p>{task.description}</p>
    <ul className="student-task-criteria">{task.acceptanceCriteria.map((criterion) => <li key={criterion}>{criterion}</li>)}</ul>
    <select aria-label={`Status for ${task.title}`} disabled={busy} onChange={(event) => setStatus(event.target.value as AssignmentTaskProgress['status'])} value={status}><option value="not-started">Not started</option><option value="in-progress">In progress</option><option value="completed">Completed</option></select>
    <textarea aria-label={`Notes for ${task.title}`} disabled={busy} maxLength={4000} onChange={(event) => setNotes(event.target.value)} placeholder="Working notes for this task..." value={notes} />
    <button className="student-task-save" disabled={!dirty || busy} onClick={() => onUpdate({ taskId: task.id, status, notes })} type="button"><Save size={12} /> Save progress</button>
  </article>
}
