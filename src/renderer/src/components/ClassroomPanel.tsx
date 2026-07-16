import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, BookOpenCheck, Clipboard, DoorOpen, Download, GraduationCap, Link2, LogOut, Plus, RefreshCw, RotateCw, Send, UserRoundPlus, UsersRound } from 'lucide-react'
import type { AssignmentWorkspaceState, Classroom, ClassroomCreateRequest, CloudUser, WorkspaceSnapshot } from '@shared/contracts'

type ClassroomPanelProps = {
  actionVersion: number
  assignment: AssignmentWorkspaceState | null
  busy: boolean
  classrooms: Classroom[]
  error: string | null
  user: CloudUser
  workspace: WorkspaceSnapshot | null
  onCopyInvite: (inviteLink: string) => void
  onCreate: (request: ClassroomCreateRequest) => void
  onJoin: (invite: string) => void
  onOpenAssignment: (assignmentId: string) => void
  onPublish: (classroomId: string) => void
  onRefresh: () => void
  onRotateInvite: (classroomId: string) => void
  onSignOut: () => void
}

export function ClassroomPanel(props: ClassroomPanelProps): React.JSX.Element {
  const [selectedId, setSelectedId] = useState<string | null>(props.classrooms[0]?.id ?? null)
  const [form, setForm] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [invite, setInvite] = useState('')
  const selected = useMemo(() => props.classrooms.find((classroom) => classroom.id === selectedId) ?? props.classrooms[0] ?? null, [props.classrooms, selectedId])

  useEffect(() => {
    if (!props.classrooms.length) setSelectedId(null)
    else if (!props.classrooms.some((classroom) => classroom.id === selectedId)) setSelectedId(props.classrooms[0].id)
  }, [props.classrooms, selectedId])

  useEffect(() => {
    if (!props.actionVersion) return
    setForm(null)
    setName('')
    setDescription('')
    setInvite('')
  }, [props.actionVersion])

  const closeForm = () => {
    setForm(null)
    setName('')
    setDescription('')
    setInvite('')
  }

  return <aside className="side-panel classroom-panel">
    <div className="panel-heading"><span>Classrooms</span><button aria-label="Refresh classrooms" disabled={props.busy} onClick={props.onRefresh} title="Refresh" type="button"><RefreshCw size={14} /></button></div>
    <div className="classroom-scroll">
      <section className="classroom-account"><div>{props.user.email.slice(0, 1).toUpperCase()}</div><span><b>{props.user.email}</b><small>Wormie account</small></span><button aria-label="Sign out" onClick={props.onSignOut} title="Sign out" type="button"><LogOut size={13} /></button></section>

      {props.error && <div className="classroom-error" role="alert">{props.error}</div>}

      {form && <form className="classroom-form" onSubmit={(event) => {
        event.preventDefault()
        if (form === 'create') props.onCreate({ name, description })
        else props.onJoin(invite)
      }}>
        <button className="classroom-back" onClick={closeForm} type="button"><ArrowLeft size={12} /> Back</button>
        <span className="classroom-overline">{form === 'create' ? 'New learning space' : 'Enter a classroom'}</span>
        <h3>{form === 'create' ? 'Create classroom' : 'Join with an invite'}</h3>
        {form === 'create' ? <>
          <label><span>Name</span><input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Mobile App Studio" required value={name} /></label>
          <label><span>Description</span><textarea maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="What this class is building and learning." value={description} /></label>
        </> : <label><span>Invite link or code</span><textarea autoFocus maxLength={500} onChange={(event) => setInvite(event.target.value)} placeholder="wormie://join/..." required value={invite} /></label>}
        <button className="classroom-primary" disabled={props.busy} type="submit">{props.busy ? 'Working...' : form === 'create' ? 'Create classroom' : 'Join classroom'}</button>
      </form>}

      {!form && <>
        <div className="classroom-actions"><button onClick={() => setForm('create')} type="button"><Plus size={13} /> Create</button><button onClick={() => setForm('join')} type="button"><UserRoundPlus size={13} /> Join</button></div>

        {props.busy && !props.classrooms.length && <div className="classroom-loading">Opening your classrooms...</div>}
        {!props.busy && !props.classrooms.length && <section className="classroom-empty"><div><GraduationCap size={19} /></div><span className="classroom-overline">No classrooms yet</span><h3>Teach here. Learn here.</h3><p>Create a room for your students, or join one using a teacher's invite.</p></section>}

        {props.classrooms.length > 0 && <div className="classroom-list" aria-label="Your classrooms">
          {props.classrooms.map((classroom) => <button data-active={selected?.id === classroom.id} key={classroom.id} onClick={() => setSelectedId(classroom.id)} type="button"><span>{classroom.name.slice(0, 2).toUpperCase()}</span><div><b>{classroom.name}</b><small>{classroom.role === 'teacher' ? 'Teaching' : 'Student'} / {classroom.assignments.length} assignment{classroom.assignments.length === 1 ? '' : 's'}</small></div></button>)}
        </div>}

        {selected && <div className="classroom-detail">
          <section className="classroom-hero"><span className="classroom-overline">{selected.role === 'teacher' ? 'Teacher classroom' : 'Joined classroom'}</span><h3>{selected.name}</h3><p>{selected.description || 'No classroom description yet.'}</p><div><span><UsersRound size={12} /> {selected.members.length}</span><span><BookOpenCheck size={12} /> {selected.assignments.length}</span></div></section>

          {selected.role === 'teacher' && selected.inviteLink && <section className="classroom-invite"><div><Link2 size={14} /><b>Student invite</b></div><code>{selected.inviteLink}</code><div><button onClick={() => props.onCopyInvite(selected.inviteLink!)} type="button"><Clipboard size={12} /> Copy</button><button disabled={props.busy} onClick={() => props.onRotateInvite(selected.id)} type="button"><RotateCw size={12} /> Replace</button></div></section>}

          {selected.role === 'teacher' && <button className="classroom-publish" disabled={props.busy || !props.workspace || !props.assignment?.manifest || props.assignment.role === 'student'} onClick={() => props.onPublish(selected.id)} type="button"><Send size={13} /> {props.assignment?.manifest ? `Publish ${props.assignment.manifest.title}` : 'Open a teacher assignment to publish'}</button>}

          <section className="classroom-section"><div className="classroom-section-title"><span>Assignments</span><b>{selected.assignments.length}</b></div>{selected.assignments.length === 0 ? <p className="classroom-section-empty">Published work will appear here automatically.</p> : <div className="classroom-assignment-list">{selected.assignments.map((assignment) => <article key={assignment.id}><span><b>{assignment.title}</b><small>{assignment.summary}</small><time>{new Date(assignment.publishedAt).toLocaleDateString()}</time></span><button disabled={props.busy} onClick={() => props.onOpenAssignment(assignment.id)} title="Download and open assignment" type="button">{selected.role === 'student' ? <Download size={13} /> : <DoorOpen size={13} />}</button></article>)}</div>}</section>

          <section className="classroom-section"><div className="classroom-section-title"><span>People</span><b>{selected.members.length}</b></div><div className="classroom-member-list">{selected.members.map((member) => <div key={member.userId}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><div><b>{member.displayName}</b>{member.email && <small>{member.email}</small>}</div><em>{member.role}</em></div>)}</div></section>
        </div>}
      </>}
    </div>
  </aside>
}
