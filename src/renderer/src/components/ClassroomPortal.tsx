import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, BookOpenCheck, Clipboard, Download, DoorOpen, GraduationCap, Link2, LogOut, Plus, RefreshCw, RotateCw, Send, UserRoundPlus, UsersRound, X } from 'lucide-react'
import type { AssignmentWorkspaceState, Classroom, ClassroomCreateRequest, CloudUser, WorkspaceSnapshot } from '@shared/contracts'

type ClassroomPortalProps = {
  actionVersion: number
  assignment: AssignmentWorkspaceState | null
  busy: boolean
  classrooms: Classroom[]
  error: string | null
  selectedClassroomId: string | null
  user: CloudUser
  workspace: WorkspaceSnapshot | null
  onBack: () => void
  onCopyInvite: (inviteLink: string) => void
  onCreate: (request: ClassroomCreateRequest) => void
  onJoin: (invite: string) => void
  onOpenAssignment: (classroom: Classroom, assignmentId: string) => void
  onPublish: (classroomId: string) => void
  onRefresh: () => void
  onRotateInvite: (classroomId: string) => void
  onSelectClassroom: (classroomId: string) => void
  onSignOut: () => void
}

type PortalTab = 'assignments' | 'people'

export function ClassroomPortal(props: ClassroomPortalProps): React.JSX.Element {
  const [form, setForm] = useState<'create' | 'join' | null>(null)
  const [tab, setTab] = useState<PortalTab>('assignments')
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [invite, setInvite] = useState('')
  const teaching = useMemo(() => props.classrooms.filter((classroom) => classroom.role === 'teacher'), [props.classrooms])
  const enrolled = useMemo(() => props.classrooms.filter((classroom) => classroom.role === 'student'), [props.classrooms])
  const selected = props.classrooms.find((classroom) => classroom.id === props.selectedClassroomId) ?? props.classrooms[0] ?? null

  useEffect(() => {
    if (!selected && props.classrooms[0]) props.onSelectClassroom(props.classrooms[0].id)
  }, [props.classrooms, selected])

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

  return <main className="classroom-portal">
    <header className="portal-titlebar">
      <button className="portal-back" onClick={props.onBack} type="button"><ArrowLeft size={15} /> Home</button>
      <div className="portal-brand"><span className="launcher-worm"><i /><i /><i /></span><b>Wormie Classrooms</b></div>
      <div className="portal-account"><span>{props.user.email}</span><button onClick={props.onSignOut} type="button"><LogOut size={14} /><span className="sr-only">Sign out</span></button></div>
    </header>

    <div className="portal-layout">
      <aside className="portal-sidebar" aria-label="Classroom navigation">
        <div className="portal-sidebar-heading"><div><span>Learning spaces</span><b>{props.classrooms.length}</b></div><button aria-label="Refresh classrooms" disabled={props.busy} onClick={props.onRefresh} type="button"><RefreshCw className={props.busy ? 'spin' : ''} size={15} /></button></div>
        <div className="portal-actions"><button onClick={() => setForm('create')} type="button"><Plus size={14} /> Create</button><button onClick={() => setForm('join')} type="button"><UserRoundPlus size={14} /> Join</button></div>
        {props.error && <div className="portal-error" role="alert">{props.error}</div>}
        <ClassroomGroup classrooms={teaching} label="Teaching" onSelect={props.onSelectClassroom} selectedId={selected?.id ?? null} />
        <ClassroomGroup classrooms={enrolled} label="Enrolled" onSelect={props.onSelectClassroom} selectedId={selected?.id ?? null} />
        {!props.busy && props.classrooms.length === 0 && <div className="portal-sidebar-empty"><GraduationCap size={20} /><p>No classrooms yet.</p></div>}
      </aside>

      <section className="portal-main">
        <AnimatePresence mode="wait">
          {form ? <motion.div animate={{ opacity: 1 }} className="portal-form-shell" exit={{ opacity: 0 }} initial={{ opacity: 0 }} key={form}>
            <form className="portal-form" onSubmit={(event) => {
              event.preventDefault()
              if (form === 'create') props.onCreate({ name, description })
              else props.onJoin(invite)
            }}>
              <button aria-label="Close form" className="portal-form-close" onClick={closeForm} type="button"><X size={17} /></button>
              <span className="portal-overline">{form === 'create' ? 'Teacher workspace' : 'Student access'}</span>
              <h1>{form === 'create' ? 'Create a classroom' : 'Join your classroom'}</h1>
              <p>{form === 'create' ? 'Start a focused home for assignments, students, and classroom mastery.' : 'Paste the invitation sent by your teacher.'}</p>
              {form === 'create' ? <>
                <label><span>Name</span><input autoFocus maxLength={120} onChange={(event) => setName(event.target.value)} placeholder="Mobile App Studio" required value={name} /></label>
                <label><span>Description</span><textarea maxLength={1000} onChange={(event) => setDescription(event.target.value)} placeholder="What will this class build?" value={description} /></label>
              </> : <label><span>Invitation</span><input autoFocus onChange={(event) => setInvite(event.target.value)} placeholder="wormie://join/..." required value={invite} /></label>}
              <button className="portal-primary" disabled={props.busy} type="submit">{form === 'create' ? 'Create classroom' : 'Join classroom'}</button>
            </form>
          </motion.div> : selected ? <motion.div animate={{ opacity: 1, y: 0 }} className="portal-classroom" initial={{ opacity: 0, y: 6 }} key={selected.id}>
            <header className="portal-classroom-header">
              <div><span className="portal-overline">{selected.role === 'teacher' ? 'Teaching' : 'Enrolled'}</span><h1>{selected.name}</h1><p>{selected.description || 'No classroom description.'}</p></div>
              <div className="portal-classroom-stats"><span><UsersRound size={15} /><b>{selected.members.length}</b> people</span><span><BookOpenCheck size={15} /><b>{selected.assignments.length}</b> assignments</span></div>
            </header>
            <nav className="portal-tabs" aria-label="Classroom sections"><button aria-selected={tab === 'assignments'} onClick={() => setTab('assignments')} role="tab" type="button">Assignments</button><button aria-selected={tab === 'people'} onClick={() => setTab('people')} role="tab" type="button">People</button></nav>
            <div className="portal-tab-content">
              {tab === 'assignments' && <AssignmentsTab {...props} classroom={selected} />}
              {tab === 'people' && <PeopleTab classroom={selected} />}
            </div>
          </motion.div> : <div className="portal-empty"><GraduationCap size={28} /><h1>Classrooms live here.</h1><p>Create a class to teach, or join one with an invitation.</p></div>}
        </AnimatePresence>
      </section>
    </div>
  </main>
}

function ClassroomGroup({ classrooms, label, onSelect, selectedId }: { classrooms: Classroom[]; label: string; onSelect: (id: string) => void; selectedId: string | null }): React.JSX.Element | null {
  if (!classrooms.length) return null
  return <section className="portal-classroom-group"><div className="portal-group-label"><span>{label}</span><b>{classrooms.length}</b></div>{classrooms.map((classroom) => <button aria-current={selectedId === classroom.id ? 'page' : undefined} key={classroom.id} onClick={() => onSelect(classroom.id)} type="button"><span>{classroom.name.slice(0, 2).toUpperCase()}</span><div><b>{classroom.name}</b><small>{classroom.assignments.length} assignment{classroom.assignments.length === 1 ? '' : 's'}</small></div></button>)}</section>
}

function AssignmentsTab(props: ClassroomPortalProps & { classroom: Classroom }): React.JSX.Element {
  const classroom = props.classroom
  const publishableAssignment = props.assignment?.manifest && props.workspace && props.assignment.workspaceRoot === props.workspace.rootPath && props.assignment.role !== 'student'
    ? props.assignment
    : null
  return <div className="portal-section-grid">
    <section className="portal-section-main">
      <div className="portal-section-heading"><div><span>Course work</span><h2>Assignments</h2></div>{classroom.role === 'teacher' && <button className="portal-accent-button" disabled={props.busy || !publishableAssignment} onClick={() => props.onPublish(classroom.id)} type="button"><Send size={14} /> {publishableAssignment ? `Publish ${publishableAssignment.manifest!.title}` : 'Open a teacher assignment to publish'}</button>}</div>
      {classroom.assignments.length === 0 ? <div className="portal-section-empty"><BookOpenCheck size={21} /><p>No assignments have been published.</p></div> : <div className="portal-assignment-grid">{classroom.assignments.map((assignment, index) => <article key={assignment.id}><span className="portal-assignment-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{assignment.title}</h3><time>{new Date(assignment.publishedAt).toLocaleDateString()}</time></div><button disabled={props.busy} onClick={() => props.onOpenAssignment(classroom, assignment.id)} type="button">{classroom.role === 'student' ? <><Download size={14} /> Open assignment</> : <><DoorOpen size={14} /> Open project</>}</button></article>)}</div>}
    </section>
    {classroom.role === 'teacher' && classroom.inviteLink && <aside className="portal-invite-card"><div className="portal-invite-icon"><Link2 size={18} /></div><span>Student invitation</span><h3>Bring the class in.</h3><code>{classroom.inviteLink}</code><div><button onClick={() => props.onCopyInvite(classroom.inviteLink!)} type="button"><Clipboard size={13} /> Copy</button><button disabled={props.busy} onClick={() => props.onRotateInvite(classroom.id)} type="button"><RotateCw size={13} /> Replace</button></div></aside>}
  </div>
}

function PeopleTab({ classroom }: { classroom: Classroom }): React.JSX.Element {
  return <div className="portal-people"><div className="portal-section-heading"><div><span>Class roster</span><h2>People</h2></div></div>{(['teacher', 'student'] as const).map((role) => {
    const members = classroom.members.filter((member) => member.role === role)
    return <section className="portal-people-group" key={role}><header><h3>{role === 'teacher' ? 'Teachers' : 'Students'}</h3><span>{members.length}</span></header>{members.length === 0 ? <p>No {role === 'teacher' ? 'teachers' : 'students'} yet.</p> : <div>{members.map((member) => <article key={member.userId}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><div><b>{member.displayName}</b><small>{member.email ?? (role === 'teacher' ? 'Teacher' : 'Student')}</small></div></article>)}</div>}</section>
  })}</div>
}
