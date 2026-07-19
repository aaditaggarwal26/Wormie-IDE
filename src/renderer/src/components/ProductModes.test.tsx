import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Classroom } from '@shared/contracts'
import { ClassroomPortal } from './ClassroomPortal'
import { WormieLauncher } from './WormieLauncher'

const action = () => undefined
const classroom: Classroom = {
  id: 'classroom-1',
  name: 'Mobile App Studio',
  description: 'Build a mobile experience.',
  ownerId: 'teacher-1',
  role: 'teacher',
  inviteCode: 'invite',
  inviteLink: 'wormie://join/invite',
  createdAt: '2026-07-19T00:00:00.000Z',
  members: [],
  assignments: []
}

describe('authenticated product modes', () => {
  it('makes Sandbox and Classrooms the launcher destinations', () => {
    const markup = renderToStaticMarkup(<WormieLauncher
      enrolledCount={1}
      onOpenClassrooms={action}
      onOpenSandbox={action}
      onSignOut={action}
      teachingCount={1}
      user={{ id: 'user-1', email: 'student@example.com' }}
      workspace={null}
    />)

    expect(markup).toContain('Open the IDE')
    expect(markup).toContain('Open classrooms')
  })

  it('renders classroom management without IDE chrome', () => {
    const markup = renderToStaticMarkup(<ClassroomPortal
      actionVersion={0}
      assignment={null}
      busy={false}
      classrooms={[classroom]}
      error={null}
      onBack={action}
      onCopyInvite={action}
      onCreate={action}
      onJoin={action}
      onAuthorAssignment={action}
      onOpenAssignment={action}
      onPublish={action}
      onRefresh={action}
      onRotateInvite={action}
      onSelectClassroom={action}
      onSelectTab={action}
      onSignOut={action}
      selectedClassroomId={classroom.id}
      selectedTab="assignments"
      user={{ id: 'teacher-1', email: 'teacher@example.com' }}
      workspace={null}
    />)

    expect(markup).toContain('classroom-portal')
    expect(markup).not.toContain('class="workbench"')
    expect(markup).not.toContain('activity-rail')
    expect(markup).not.toContain('terminal-workbench')
  })
})
