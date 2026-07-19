import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ArrowLeft, BookOpenCheck, BrainCircuit, CheckCircle2, Clipboard, Download, DoorOpen, FolderInput, GraduationCap, Link2, LogOut, Plus, RefreshCw, RotateCw, Send, UserMinus, UserRoundPlus, UsersRound, X } from 'lucide-react'
import type { AssignmentWorkspaceState, Classroom, ClassroomCreateRequest, ClassroomMasterySnapshot, CloudUser, WorkspaceSnapshot } from '@shared/contracts'
import { classroomTabsForRole, groupClassrooms, validClassroomTab } from '../classrooms/classroomPortalModel'
import type { ClassroomPortalTab } from '../navigation/applicationMode'

type ClassroomPortalProps = {
  actionVersion: number
  assignment: AssignmentWorkspaceState | null
  busy: boolean
  classrooms: Classroom[]
  error: string | null
  mastery: ClassroomMasterySnapshot | null
  masteryBusy: boolean
  selectedClassroomId: string | null
  selectedTab: ClassroomPortalTab
  user: CloudUser
  workspace: WorkspaceSnapshot | null
  onBack: () => void
  onAddStudent: (classroomId: string, email: string) => void
  onCopyInvite: (inviteLink: string) => void
  onCreate: (request: ClassroomCreateRequest) => void
  onJoin: (invite: string) => void
  onLeaveClassroom: (classroomId: string) => void
  onAuthorAssignment: (classroom: Classroom) => void
  onOpenAssignment: (classroom: Classroom, assignmentId: string) => void
  onPublish: (classroomId: string) => void
  onRefresh: () => void
  onRemoveStudent: (classroomId: string, userId: string) => void
  onRotateInvite: (classroomId: string) => void
  onSelectClassroom: (classroomId: string) => void
  onSelectTab: (tab: ClassroomPortalTab) => void
  onSignOut: () => void
}

export function ClassroomPortal(props: ClassroomPortalProps): React.JSX.Element {
  const [form, setForm] = useState<'create' | 'join' | null>(null)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [invite, setInvite] = useState('')
  const { teaching, enrolled } = useMemo(() => groupClassrooms(props.classrooms), [props.classrooms])
  const selected = props.classrooms.find((classroom) => classroom.id === props.selectedClassroomId) ?? props.classrooms[0] ?? null
  const selectedTab = selected ? validClassroomTab(selected.role, props.selectedTab) : 'assignments'

  useEffect(() => {
    if (props.classrooms.length && !props.classrooms.some((classroom) => classroom.id === props.selectedClassroomId)) {
      props.onSelectClassroom(props.classrooms[0].id)
    }
  }, [props.classrooms, props.selectedClassroomId])

  useEffect(() => {
    if (selected && selectedTab !== props.selectedTab) props.onSelectTab(selectedTab)
  }, [props.selectedTab, selected, selectedTab])

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
      <div className="portal-account"><span>{props.user.email}</span><button disabled={props.busy} onClick={props.onSignOut} type="button"><LogOut size={14} /><span className="sr-only">Sign out</span></button></div>
    </header>

    <div className="portal-layout">
      <aside className="portal-sidebar" aria-label="Classroom navigation">
        <div className="portal-sidebar-heading"><div><span>Learning spaces</span><b>{props.classrooms.length}</b></div><button aria-label="Refresh classrooms" disabled={props.busy} onClick={props.onRefresh} type="button"><RefreshCw className={props.busy ? 'spin' : ''} size={15} /></button></div>
        <div className="portal-actions"><button onClick={() => setForm('create')} type="button"><Plus size={14} /> Create</button><button onClick={() => setForm('join')} type="button"><UserRoundPlus size={14} /> Join</button></div>
        {props.error && <div className="portal-error" role="alert">{props.error}</div>}
        <ClassroomGroup classrooms={teaching} label="Teaching" onSelect={props.onSelectClassroom} selectedId={selected?.id ?? null} />
        <ClassroomGroup classrooms={enrolled} label="Enrolled" onSelect={props.onSelectClassroom} selectedId={selected?.id ?? null} />
        {props.busy && props.classrooms.length === 0 && <div className="portal-sidebar-empty"><RefreshCw className="spin" size={20} /><p>Loading classrooms...</p></div>}
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
            <nav className="portal-tabs" aria-label="Classroom sections">{classroomTabsForRole(selected.role).map((tab) => <button aria-selected={selectedTab === tab} key={tab} onClick={() => props.onSelectTab(tab)} role="tab" type="button">{tab}</button>)}</nav>
            <div className="portal-tab-content">
              {selectedTab === 'assignments' && <AssignmentsTab {...props} classroom={selected} />}
              {selectedTab === 'people' && <PeopleTab {...props} classroom={selected} />}
              {selectedTab === 'mastery' && <MasteryTab {...props} classroom={selected} />}
              {selectedTab === 'settings' && selected.role === 'teacher' && <ClassroomSettings {...props} classroom={selected} />}
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
  return <div className="portal-section-grid portal-section-grid-single">
    <section className="portal-section-main">
      <div className="portal-section-heading"><div><span>Course work</span><h2>Assignments</h2></div>{classroom.role === 'teacher' && <div className="portal-assignment-actions"><button className="portal-secondary-button" disabled={props.busy} onClick={() => props.onAuthorAssignment(classroom)} type="button"><FolderInput size={14} /> Author from folder</button><button className="portal-accent-button" disabled={props.busy || !publishableAssignment} onClick={() => props.onPublish(classroom.id)} type="button"><Send size={14} /> {publishableAssignment ? `Publish ${publishableAssignment.manifest!.title}` : 'No draft ready'}</button></div>}</div>
      {classroom.assignments.length === 0 ? <div className="portal-section-empty"><BookOpenCheck size={21} /><p>No assignments have been published.</p></div> : <div className="portal-assignment-grid">{classroom.assignments.map((assignment, index) => <article key={assignment.id}><span className="portal-assignment-number">{String(index + 1).padStart(2, '0')}</span><div><h3>{assignment.title}</h3><time>{new Date(assignment.publishedAt).toLocaleDateString()}</time></div><button disabled={props.busy} onClick={() => props.onOpenAssignment(classroom, assignment.id)} type="button">{classroom.role === 'student' ? <><Download size={14} /> Open assignment</> : <><DoorOpen size={14} /> Open project</>}</button></article>)}</div>}
    </section>
  </div>
}

function PeopleTab(props: ClassroomPortalProps & { classroom: Classroom }): React.JSX.Element {
  const { classroom } = props
  const [studentEmail, setStudentEmail] = useState('')

  useEffect(() => setStudentEmail(''), [props.actionVersion])

  return <div className="portal-people"><div className="portal-section-heading"><div><span>Class roster</span><h2>People</h2></div>{classroom.role === 'teacher' && <form className="portal-add-student" onSubmit={(event) => { event.preventDefault(); props.onAddStudent(classroom.id, studentEmail) }}><label className="sr-only" htmlFor="portal-student-email">Student email</label><input id="portal-student-email" onChange={(event) => setStudentEmail(event.target.value)} placeholder="student@example.com" required type="email" value={studentEmail} /><button disabled={props.busy} type="submit"><UserRoundPlus size={14} /> Add student</button></form>}</div>{(['teacher', 'student'] as const).map((role) => {
    const members = classroom.members.filter((member) => member.role === role)
    return <section className="portal-people-group" key={role}><header><h3>{role === 'teacher' ? 'Teachers' : 'Students'}</h3><span>{members.length}</span></header>{members.length === 0 ? <p>No {role === 'teacher' ? 'teachers' : 'students'} yet.</p> : <div>{members.map((member) => <article key={member.userId}><span>{member.displayName.slice(0, 1).toUpperCase()}</span><div><b>{member.displayName}</b><small>{member.email ?? (role === 'teacher' ? 'Teacher' : 'Student')}</small></div>{classroom.role === 'teacher' && role === 'student' && <button aria-label={`Remove ${member.displayName}`} disabled={props.busy} onClick={() => { if (window.confirm(`Remove ${member.displayName} from ${classroom.name}?`)) props.onRemoveStudent(classroom.id, member.userId) }} type="button"><UserMinus size={14} /></button>}</article>)}</div>}</section>
  })}{classroom.role === 'student' && <section className="portal-leave-class"><div><h3>Leave classroom</h3><p>Your local assignment files remain on this computer, but you will lose access to future classroom updates.</p></div><button disabled={props.busy} onClick={() => { if (window.confirm(`Leave ${classroom.name}?`)) props.onLeaveClassroom(classroom.id) }} type="button"><LogOut size={14} /> Leave classroom</button></section>}</div>
}

function ClassroomSettings(props: ClassroomPortalProps & { classroom: Classroom }): React.JSX.Element {
  const classroom = props.classroom
  return <div className="portal-settings">
    <div className="portal-section-heading"><div><span>Teacher controls</span><h2>Classroom settings</h2></div></div>
    <section className="portal-settings-card"><div><Link2 size={18} /><div><h3>Student invitation</h3><p>Share this invitation with students, or replace it to invalidate the previous link.</p></div></div>{classroom.inviteLink ? <><code>{classroom.inviteLink}</code><div><button onClick={() => props.onCopyInvite(classroom.inviteLink!)} type="button"><Clipboard size={13} /> Copy invitation</button><button disabled={props.busy} onClick={() => props.onRotateInvite(classroom.id)} type="button"><RotateCw size={13} /> Replace link</button></div></> : <p className="portal-settings-unavailable">Invitation data is unavailable. Refresh the classroom and try again.</p>}</section>
  </div>
}

function MasteryTab(props: ClassroomPortalProps & { classroom: Classroom }): React.JSX.Element {
  const visibleStudentIds = [...new Set([...(props.mastery?.concepts.map((item) => item.studentId) ?? []), ...(props.mastery?.events.map((item) => item.studentId) ?? [])])]
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)
  const effectiveStudentId = selectedStudentId && visibleStudentIds.includes(selectedStudentId) ? selectedStudentId : visibleStudentIds[0] ?? null
  const memberName = (studentId: string) => props.classroom.members.find((member) => member.userId === studentId)?.displayName ?? 'Student'
  const concepts = props.mastery?.concepts.filter((item) => item.studentId === effectiveStudentId) ?? []
  const events = props.mastery?.events.filter((item) => item.studentId === effectiveStudentId) ?? []
  const average = concepts.length ? Math.round(concepts.reduce((total, concept) => total + concept.mastery, 0) / concepts.length) : 0

  if (props.masteryBusy && !props.mastery) return <div className="portal-mastery-state"><RefreshCw className="spin" size={22} /><p>Loading classroom mastery...</p></div>
  if (!props.mastery || visibleStudentIds.length === 0) return <div className="portal-mastery-state"><BrainCircuit size={24} /><h2>No mastery activity yet.</h2><p>Completed classroom understanding checks will appear here.</p></div>

  return <div className="portal-mastery">
    {props.mastery.pendingSyncCount > 0 && <div className="portal-sync-notice">{props.mastery.pendingSyncCount} local mastery event{props.mastery.pendingSyncCount === 1 ? '' : 's'} waiting to sync.</div>}
    {props.classroom.role === 'teacher' && <aside className="portal-mastery-students"><span>Students</span>{visibleStudentIds.map((studentId) => <button aria-current={effectiveStudentId === studentId ? 'true' : undefined} key={studentId} onClick={() => setSelectedStudentId(studentId)} type="button"><b>{memberName(studentId)}</b><small>{props.mastery!.concepts.filter((item) => item.studentId === studentId).length} concepts</small></button>)}</aside>}
    <section className="portal-mastery-detail"><header><div><span className="portal-overline">Classroom mastery</span><h2>{memberName(effectiveStudentId!)}</h2></div><strong>{average}<small>%</small></strong></header><div className="portal-mastery-concepts">{concepts.length ? concepts.map((concept) => <article key={concept.conceptId}><div><b>{concept.conceptName}</b><small>{concept.correct} correct across {concept.attempts} attempts</small></div><span>{concept.mastery}%</span><i><em style={{ width: `${concept.mastery}%` }} /></i></article>) : <p>No concept evidence yet.</p>}</div><div className="portal-mastery-events"><h3>Recent checks</h3>{events.map((event) => <article key={`${event.quizId}:${event.attempt}`}><CheckCircle2 data-passed={event.passed} size={15} /><div><b>{event.title}</b><time>{new Date(event.completedAt).toLocaleString()}</time></div><strong>{event.score}%</strong></article>)}</div></section>
  </div>
}
