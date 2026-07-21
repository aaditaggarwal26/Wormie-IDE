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
      analytics={null}
      analyticsBusy={false}
      assignment={null}
      busy={false}
      classrooms={[classroom]}
      error={null}
      mastery={null}
      masteryBusy={false}
      onBack={action}
      onAddStudent={action}
      onCopyInvite={action}
      onCreate={action}
      onUpdateClassroom={action}
      onJoin={action}
      onLeaveClassroom={action}
      onAuthorAssignment={action}
      onOpenAssignment={action}
      onPublish={action}
      onRefresh={action}
      onRemoveStudent={action}
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

  it('shows roster management only to teachers', () => {
    const renderPortal = (value: Classroom) => renderToStaticMarkup(<ClassroomPortal
      actionVersion={0}
      analytics={null}
      analyticsBusy={false}
      assignment={null}
      busy={false}
      classrooms={[value]}
      error={null}
      mastery={null}
      masteryBusy={false}
      onAddStudent={action}
      onAuthorAssignment={action}
      onBack={action}
      onCopyInvite={action}
      onCreate={action}
      onUpdateClassroom={action}
      onJoin={action}
      onLeaveClassroom={action}
      onOpenAssignment={action}
      onPublish={action}
      onRefresh={action}
      onRemoveStudent={action}
      onRotateInvite={action}
      onSelectClassroom={action}
      onSelectTab={action}
      onSignOut={action}
      selectedClassroomId={value.id}
      selectedTab="people"
      user={{ id: 'user-1', email: 'user@example.com' }}
      workspace={null}
    />)

    expect(renderPortal(classroom)).toContain('Add student')
    expect(renderPortal({ ...classroom, role: 'student' })).not.toContain('Add student')
    expect(renderPortal({ ...classroom, role: 'student' })).toContain('Leave classroom')
  })

  it('shows editable classroom details only in teacher settings', () => {
    const markup = renderToStaticMarkup(<ClassroomPortal
      actionVersion={0} analytics={null} analyticsBusy={false} assignment={null} busy={false} classrooms={[classroom]} error={null} mastery={null} masteryBusy={false}
      onAddStudent={action} onAuthorAssignment={action} onBack={action} onCopyInvite={action} onCreate={action} onJoin={action}
      onLeaveClassroom={action} onOpenAssignment={action} onPublish={action} onRefresh={action} onRemoveStudent={action}
      onRotateInvite={action} onSelectClassroom={action} onSelectTab={action} onSignOut={action} onUpdateClassroom={action}
      selectedClassroomId={classroom.id} selectedTab="settings" user={{ id: 'teacher-1', email: 'teacher@example.com' }} workspace={null}
    />)

    expect(markup).toContain('Classroom details')
    expect(markup).toContain('Save changes')
  })

  it('shows aggregate AI analytics to teachers without privacy boilerplate', () => {
    const markup = renderToStaticMarkup(<ClassroomPortal
      actionVersion={0} analytics={{ classroomId: classroom.id, pendingSyncCount: 0, students: [{
        studentId: 'student-1', requestCount: 2, totalRequestCharacters: 300, averageRequestCharacters: 150,
        quizAttemptCount: 1, quizQuestionCount: 3, averageQuizScore: 90,
        requestScopes: { micro: 1, small: 1, medium: 0, large: 0 },
        inputTokens: 100, cachedInputTokens: 20, outputTokens: 50, reasoningOutputTokens: 10, totalTokens: 150,
        reportedCredits: null, lastActivityAt: '2026-07-20T00:00:00.000Z'
      }] }} analyticsBusy={false} assignment={null} busy={false} classrooms={[classroom]} error={null} mastery={null} masteryBusy={false}
      onAddStudent={action} onAuthorAssignment={action} onBack={action} onCopyInvite={action} onCreate={action} onJoin={action}
      onLeaveClassroom={action} onOpenAssignment={action} onPublish={action} onRefresh={action} onRemoveStudent={action}
      onRotateInvite={action} onSelectClassroom={action} onSelectTab={action} onSignOut={action} onUpdateClassroom={action}
      selectedClassroomId={classroom.id} selectedTab="analytics" user={{ id: 'teacher-1', email: 'teacher@example.com' }} workspace={null}
    />)

    expect(markup).toContain('AI learning analytics')
    expect(markup).not.toContain('Usage metadata only')
    expect(markup).not.toContain('Student prompts')
  })

  it('shows assignment publication and due dates', () => {
    const assignmentClassroom: Classroom = {
      ...classroom,
      assignments: [{
        id: 'assignment-1',
        localAssignmentId: 'local-1',
        title: 'Profile screen',
        summary: 'Complete the profile screen.',
        publishedAt: '2026-07-20T16:00:00.000Z',
        dueAt: '2026-07-25T23:00:00.000Z',
        publishedBy: 'teacher-1'
      }]
    }
    const markup = renderToStaticMarkup(<ClassroomPortal
      actionVersion={0} analytics={null} analyticsBusy={false} assignment={null} busy={false} classrooms={[assignmentClassroom]} error={null} mastery={null} masteryBusy={false}
      onAddStudent={action} onAuthorAssignment={action} onBack={action} onCopyInvite={action} onCreate={action} onJoin={action}
      onLeaveClassroom={action} onOpenAssignment={action} onPublish={action} onRefresh={action} onRemoveStudent={action}
      onRotateInvite={action} onSelectClassroom={action} onSelectTab={action} onSignOut={action} onUpdateClassroom={action}
      selectedClassroomId={classroom.id} selectedTab="assignments" user={{ id: 'teacher-1', email: 'teacher@example.com' }} workspace={null}
    />)

    expect(markup).toContain('Assigned')
    expect(markup).toContain('Due')
    expect(markup).toContain('type="datetime-local"')
    expect(markup).not.toContain('Course work')
  })
})
