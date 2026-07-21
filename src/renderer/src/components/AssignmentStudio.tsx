import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { AlertTriangle, BookMarked, ChevronRight, FileCode2, Plus, Save, ShieldCheck, Trash2, X } from 'lucide-react'
import type {
  AssignmentManifest,
  AssignmentManifestDraft,
  AssignmentTask,
  AssignmentTaskKind,
  FileTreeNode,
  WorkspaceSnapshot
} from '@shared/contracts'

type EditableTask = AssignmentTask & { criteriaText: string }
type ValidationErrors = Record<string, string>

type AssignmentStudioProps = {
  workspace: WorkspaceSnapshot
  manifest: AssignmentManifest | null
  recovering: boolean
  saving: boolean
  error: string | null
  onClearError: () => void
  onClose: () => void
  onReload: () => void
  onSave: (draft: AssignmentManifestDraft) => void
  returnFocus: HTMLElement | null
}

function nextTaskId(tasks: EditableTask[]): string {
  const used = new Set(tasks.map((task) => task.id))
  let index = tasks.length + 1
  while (used.has(`task-${index}`)) index += 1
  return `task-${index}`
}

function emptyTask(id: string, filePath = ''): EditableTask {
  return { id, title: '', description: '', filePath, kind: 'implement', acceptanceCriteria: [], criteriaText: '' }
}

function workspaceFiles(entries: FileTreeNode[], rootPath: string): string[] {
  const files: string[] = []
  const visit = (nodes: FileTreeNode[]) => nodes.forEach((node) => {
    if (node.type === 'directory') visit(node.children ?? [])
    else files.push(node.path.slice(rootPath.length).replace(/^[\\/]/, '').replace(/\\/g, '/'))
  })
  visit(entries)
  return files.filter((file) => !file.startsWith('.wormie/'))
}

export function AssignmentStudio({
  workspace,
  manifest,
  recovering,
  saving,
  error,
  onClearError,
  onClose,
  onReload,
  onSave,
  returnFocus
}: AssignmentStudioProps): React.JSX.Element {
  const reducedMotion = useReducedMotion()
  const formRef = useRef<HTMLFormElement>(null)
  const titleRef = useRef<HTMLInputElement>(null)
  const initialSnapshotRef = useRef<string | null>(null)
  const submittingRef = useRef(false)
  const wasSavingRef = useRef(false)
  const files = useMemo(() => workspaceFiles(workspace.entries, workspace.rootPath), [workspace])
  const [title, setTitle] = useState(manifest?.title ?? '')
  const [summary, setSummary] = useState(manifest?.summary ?? '')
  const [instructions, setInstructions] = useState(manifest?.instructions ?? '')
  const [tasks, setTasks] = useState<EditableTask[]>(
    manifest?.tasks.map((task) => ({ ...task, criteriaText: task.acceptanceCriteria.join('\n') })) ??
    [emptyTask('task-1', files[0] ?? '')]
  )
  const [aiMode, setAiMode] = useState<'learning-gated' | 'disabled'>(manifest?.aiPolicy.mode ?? 'learning-gated')
  const [passingScore, setPassingScore] = useState(manifest?.aiPolicy.passingScore ?? 80)
  const [allowGeneration, setAllowGeneration] = useState(manifest?.aiPolicy.allowGeneration ?? true)
  const [includeAiActivity, setIncludeAiActivity] = useState(manifest?.evidencePolicy.includeAiActivity ?? true)
  const [includeFileSnapshots, setIncludeFileSnapshots] = useState(manifest?.evidencePolicy.includeFileSnapshots ?? true)
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>({})

  const snapshot = JSON.stringify({ title, summary, instructions, tasks, aiMode, passingScore, allowGeneration, includeAiActivity, includeFileSnapshots })
  if (initialSnapshotRef.current === null) initialSnapshotRef.current = snapshot
  const dirty = snapshot !== initialSnapshotRef.current

  useEffect(() => {
    if (wasSavingRef.current && !saving) submittingRef.current = false
    wasSavingRef.current = saving
  }, [saving])

  const clearErrors = useCallback((key?: string) => {
    if (key) setValidationErrors((current) => {
      const next = { ...current }
      delete next[key]
      return next
    })
    onClearError()
  }, [onClearError])

  const requestClose = useCallback(() => {
    if (saving) return
    if (dirty && !window.confirm('Discard the unsaved assignment changes?')) return
    onClose()
  }, [dirty, onClose, saving])

  useEffect(() => {
    const previousFocus = returnFocus ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null)
    requestAnimationFrame(() => titleRef.current?.focus())
    return () => previousFocus?.focus()
  }, [returnFocus])

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        requestClose()
        return
      }
      const modifier = window.desktop.platform === 'darwin' ? event.metaKey : event.ctrlKey
      if (modifier && event.key.toLowerCase() === 's') {
        event.preventDefault()
        formRef.current?.requestSubmit()
        return
      }
      if (event.key !== 'Tab' || !formRef.current) return
      const focusable = [...formRef.current.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')]
      if (focusable.length === 0) return
      const first = focusable[0]
      const last = focusable.at(-1)!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [requestClose])

  const updateTask = (index: number, update: Partial<EditableTask>, errorKey?: string) => {
    clearErrors(errorKey)
    setTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...update } : task))
  }

  const submit = (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    const normalizedTasks = tasks.map((task) => ({
      id: task.id,
      title: task.title.trim(),
      description: task.description.trim(),
      filePath: task.filePath.trim(),
      kind: task.kind,
      acceptanceCriteria: task.criteriaText.split(/\r?\n/).map((criterion) => criterion.trim()).filter(Boolean)
    }))
    const nextErrors: ValidationErrors = {}
    if (!title.trim()) nextErrors.title = 'Enter an assignment title.'
    if (!summary.trim()) nextErrors.summary = 'Enter a one-line summary.'
    if (!instructions.trim()) nextErrors.instructions = 'Enter instructions for the student.'
    normalizedTasks.forEach((task, index) => {
      if (!task.title) nextErrors[`task-${task.id}-title`] = 'Enter a task title.'
      if (!task.filePath) nextErrors[`task-${task.id}-path`] = 'Choose or enter a target file.'
      if (!task.description) nextErrors[`task-${task.id}-description`] = 'Describe what the student must do.'
      if (task.acceptanceCriteria.length === 0) nextErrors[`task-${task.id}-criteria`] = 'Add at least one acceptance criterion.'
      else if (task.acceptanceCriteria.length > 20) nextErrors[`task-${task.id}-criteria`] = 'Use no more than 20 acceptance criteria.'
      else if (task.acceptanceCriteria.some((criterion) => criterion.length > 500)) nextErrors[`task-${task.id}-criteria`] = 'Each acceptance criterion must be 500 characters or fewer.'
    })
    const firstError = Object.keys(nextErrors)[0]
    if (firstError) {
      setValidationErrors(nextErrors)
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-error-key="${firstError}"]`)?.focus())
      return
    }

    setValidationErrors({})
    if (submittingRef.current) return
    submittingRef.current = true
    onSave({
      id: manifest?.id,
      title: title.trim(),
      summary: summary.trim(),
      instructions: instructions.trim(),
      tasks: normalizedTasks,
      aiPolicy: aiMode === 'disabled'
        ? { mode: 'disabled', passingScore, allowGeneration: false }
        : { mode: 'learning-gated', passingScore, allowGeneration },
      evidencePolicy: { includeAiActivity, includeFileSnapshots }
    })
  }

  const errorText = (key: string) => validationErrors[key]
    ? <small className="studio-field-error" id={`${key}-error`}>{validationErrors[key]}</small>
    : null

  return (
    <motion.div animate={{ opacity: 1 }} className="assignment-studio-backdrop" initial={reducedMotion ? false : { opacity: 0 }}>
      <motion.form
        animate={{ opacity: 1, scale: 1, y: 0 }}
        aria-labelledby="assignment-studio-title"
        aria-modal="true"
        className="assignment-studio"
        initial={reducedMotion ? false : { opacity: 0, scale: 0.985, y: 12 }}
        onSubmit={submit}
        ref={formRef}
        role="dialog"
        transition={{ duration: reducedMotion ? 0 : 0.25, ease: [0.22, 1, 0.36, 1] }}
      >
        <header className="studio-header">
          <div className="studio-index">A-{String(manifest ? 2 : 1).padStart(2, '0')}</div>
          <div><span>{recovering ? 'Manifest recovery' : 'Teacher assignment desk'}</span><h2 id="assignment-studio-title">{recovering ? 'Replace the broken brief.' : manifest ? 'Refine the brief.' : 'Design the work.'}</h2></div>
          <button aria-label="Close assignment studio" disabled={saving} onClick={requestClose} type="button"><X size={18} /></button>
        </header>

        <div className="studio-progress" aria-label="Assignment authoring sections">
          <span><b>01</b> Brief</span><ChevronRight size={12} /><span><b>02</b> Tasks</span><ChevronRight size={12} /><span><b>03</b> Guardrails</span>
        </div>

        <div className="studio-scroll" inert={saving ? true : undefined}>
          {(recovering || error || Object.keys(validationErrors).length > 0) && (
            <div className="studio-alert" role="alert"><AlertTriangle size={15} /><span>{recovering ? 'The invalid manifest will be backed up before this replacement is saved.' : error ?? 'Correct the highlighted fields before saving.'}</span></div>
          )}
          <section className="studio-section studio-brief">
            <div className="studio-section-heading"><span>01</span><div><h3>The brief</h3><p>Give students enough context to understand the outcome without prescribing the implementation.</p></div></div>
            <div className="studio-field-grid">
              <label className="studio-field studio-field-wide"><span>Assignment title</span><input aria-describedby={errorText('title') ? 'title-error' : undefined} aria-invalid={Boolean(errorText('title'))} data-error-key="title" maxLength={120} onChange={(event) => { clearErrors('title'); setTitle(event.target.value) }} placeholder="Complete the profile screen" ref={titleRef} value={title} />{errorText('title')}</label>
              <label className="studio-field studio-field-wide"><span>One-line summary</span><input aria-describedby={errorText('summary') ? 'summary-error' : undefined} aria-invalid={Boolean(errorText('summary'))} data-error-key="summary" maxLength={500} onChange={(event) => { clearErrors('summary'); setSummary(event.target.value) }} placeholder="Build the final screen in the starter mobile app." value={summary} />{errorText('summary')}</label>
              <label className="studio-field studio-field-wide"><span>Student instructions</span><textarea aria-describedby={errorText('instructions') ? 'instructions-error' : undefined} aria-invalid={Boolean(errorText('instructions'))} data-error-key="instructions" maxLength={10000} onChange={(event) => { clearErrors('instructions'); setInstructions(event.target.value) }} placeholder="Explain the scenario, what is already complete, and what students should inspect first." value={instructions} />{errorText('instructions')}</label>
            </div>
          </section>

          <section className="studio-section">
            <div className="studio-section-heading"><span>02</span><div><h3>Student work</h3><p>Each task anchors intent to a real file and a visible definition of done.</p></div><button className="studio-add-task" disabled={tasks.length >= 50} onClick={() => { clearErrors(); setTasks((current) => [...current, emptyTask(nextTaskId(current), files[0] ?? '')]) }} type="button"><Plus size={13} /> Add task</button></div>
            <div className="studio-task-stack">
              <AnimatePresence initial={false}>
                {tasks.map((task, index) => (
                  <motion.fieldset className="studio-task-card" exit={reducedMotion ? undefined : { opacity: 0, height: 0 }} key={task.id} layout={!reducedMotion}>
                    <legend className="sr-only">Task {index + 1}: {task.title || 'Untitled task'}</legend>
                    <div className="studio-task-number">{String(index + 1).padStart(2, '0')}</div>
                    <div className="studio-task-fields">
                      <div className="studio-task-line">
                        <label className="studio-field"><span>Task title</span><input aria-describedby={errorText(`task-${task.id}-title`) ? `task-${task.id}-title-error` : undefined} aria-invalid={Boolean(errorText(`task-${task.id}-title`))} data-error-key={`task-${task.id}-title`} maxLength={120} onChange={(event) => updateTask(index, { title: event.target.value }, `task-${task.id}-title`)} placeholder="Implement the profile screen" value={task.title} />{errorText(`task-${task.id}-title`)}</label>
                        <label className="studio-field studio-kind-field"><span>Kind</span><select onChange={(event) => { const kind = event.target.value as AssignmentTaskKind; updateTask(index, { kind, filePath: kind === 'create' && files.includes(task.filePath) ? '' : task.filePath }) }} value={task.kind}><option value="implement">Implement</option><option value="fix">Fix</option><option value="create">Create</option><option value="explain">Explain</option></select></label>
                      </div>
                      <label className="studio-field"><span>{task.kind === 'create' ? 'New file path' : 'Target file'}</span><div className="studio-file-input"><FileCode2 size={13} /><input aria-describedby={errorText(`task-${task.id}-path`) ? `task-${task.id}-path-error` : undefined} aria-invalid={Boolean(errorText(`task-${task.id}-path`))} data-error-key={`task-${task.id}-path`} list={task.kind === 'create' ? undefined : 'assignment-workspace-files'} onChange={(event) => updateTask(index, { filePath: event.target.value }, `task-${task.id}-path`)} placeholder="src/screens/Profile.tsx" value={task.filePath} /></div>{errorText(`task-${task.id}-path`)}</label>
                      <label className="studio-field"><span>What the student must do</span><textarea aria-describedby={errorText(`task-${task.id}-description`) ? `task-${task.id}-description-error` : undefined} aria-invalid={Boolean(errorText(`task-${task.id}-description`))} data-error-key={`task-${task.id}-description`} maxLength={4000} onChange={(event) => updateTask(index, { description: event.target.value }, `task-${task.id}-description`)} placeholder="Describe the missing behavior, not the solution." value={task.description} />{errorText(`task-${task.id}-description`)}</label>
                      <label className="studio-field"><span>Acceptance criteria, one per line</span><textarea aria-describedby={errorText(`task-${task.id}-criteria`) ? `task-${task.id}-criteria-error` : undefined} aria-invalid={Boolean(errorText(`task-${task.id}-criteria`))} className="criteria-input" data-error-key={`task-${task.id}-criteria`} maxLength={10020} onChange={(event) => updateTask(index, { criteriaText: event.target.value }, `task-${task.id}-criteria`)} placeholder={'The screen renders the student profile.\nEmpty states remain usable.'} value={task.criteriaText} />{errorText(`task-${task.id}-criteria`)}</label>
                    </div>
                    <button aria-label={`Remove task ${index + 1}`} className="studio-remove-task" disabled={tasks.length === 1} onClick={() => { clearErrors(); setValidationErrors((current) => Object.fromEntries(Object.entries(current).filter(([key]) => !key.startsWith(`task-${task.id}-`)))); setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index)) }} type="button"><Trash2 size={14} /></button>
                  </motion.fieldset>
                ))}
              </AnimatePresence>
            </div>
            <datalist id="assignment-workspace-files">{files.map((file) => <option key={file} value={file} />)}</datalist>
          </section>

          <section className="studio-section studio-guardrails">
            <div className="studio-section-heading"><span>03</span><div><h3>Learning guardrails</h3><p>Make the AI policy explicit before students begin.</p></div></div>
            <div className="guardrail-grid">
              <div className="guardrail-card">
                <div className="guardrail-icon"><BookMarked size={17} /></div><div><h4>AI access</h4><p>Choose whether Wormie can tutor and generate inside this assignment.</p></div>
                <label className="studio-field"><span>AI policy</span><select onChange={(event) => { clearErrors(); setAiMode(event.target.value as 'learning-gated' | 'disabled') }} value={aiMode}><option value="learning-gated">Learning-gated AI</option><option value="disabled">AI fully disabled</option></select></label>
                <label className="studio-range"><span>Passing score <b>{passingScore}%</b></span><input disabled={aiMode === 'disabled'} max="100" min="60" onChange={(event) => { clearErrors(); setPassingScore(Number(event.target.value)) }} step="5" type="range" value={passingScore} /></label>
                <label className="studio-check"><input checked={aiMode !== 'disabled' && allowGeneration} disabled={aiMode === 'disabled'} onChange={(event) => { clearErrors(); setAllowGeneration(event.target.checked) }} type="checkbox" /><span><b>Allow generation after passing</b><small>Students can still ask for lessons when this is off.</small></span></label>
              </div>
              <div className="guardrail-card">
                <div className="guardrail-icon warm"><ShieldCheck size={17} /></div><div><h4>Submission evidence</h4><p>Students will see exactly which evidence the assignment requests.</p></div>
                <label className="studio-check"><input checked={includeAiActivity} onChange={(event) => { clearErrors(); setIncludeAiActivity(event.target.checked) }} type="checkbox" /><span><b>Include AI learning activity</b><small>Requests, concepts, quiz scores, and applied proposals.</small></span></label>
                <label className="studio-check"><input checked={includeFileSnapshots} onChange={(event) => { clearErrors(); setIncludeFileSnapshots(event.target.checked) }} type="checkbox" /><span><b>Include task-file snapshots</b><small>Final content from only the files named above.</small></span></label>
              </div>
            </div>
          </section>
        </div>

        <footer className="studio-footer">
          <div aria-live="polite" className="studio-save-status">
            {(error || Object.keys(validationErrors).length > 0) && <><AlertTriangle size={14} /><span>{error ?? 'Correct the highlighted fields before saving.'}</span></>}
            {!error && Object.keys(validationErrors).length === 0 && <><ShieldCheck size={14} /><span>{recovering ? 'The original invalid file will be preserved as a backup.' : manifest ? 'Changes are validated before the manifest is replaced.' : 'The assignment will be saved inside this starter project.'}</span></>}
          </div>
          <button className="studio-cancel" disabled={saving} onClick={requestClose} type="button">Cancel</button>
          {error?.includes('outside this editor') && <button className="studio-cancel" disabled={saving} onClick={onReload} type="button">Reload from disk</button>}
          <button className="studio-save" disabled={saving} type="submit"><Save size={14} /> {saving ? 'Saving...' : recovering ? 'Back up and replace' : 'Save assignment'}</button>
        </footer>
      </motion.form>
    </motion.div>
  )
}
