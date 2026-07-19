import type { Classroom } from '@shared/contracts'
import type { ClassroomPortalTab } from '../navigation/applicationMode'

export function groupClassrooms(classrooms: Classroom[]): { teaching: Classroom[]; enrolled: Classroom[] } {
  return {
    teaching: classrooms.filter((classroom) => classroom.role === 'teacher'),
    enrolled: classrooms.filter((classroom) => classroom.role === 'student')
  }
}

export function classroomTabsForRole(role: Classroom['role']): ClassroomPortalTab[] {
  return role === 'teacher' ? ['assignments', 'people', 'settings'] : ['assignments', 'people']
}

export function validClassroomTab(role: Classroom['role'], tab: ClassroomPortalTab): ClassroomPortalTab {
  return classroomTabsForRole(role).includes(tab) ? tab : 'assignments'
}
