import type { ApplicationMode, ClassroomPortalTab } from '@/navigation/applicationMode'

export function isCurrentClassroomRequest(
  mode: ApplicationMode,
  classroomId: string,
  tab: ClassroomPortalTab,
  requestId: number,
  latestRequestId: number
): boolean {
  return requestId === latestRequestId && mode.kind === 'classrooms' && mode.classroomId === classroomId && mode.tab === tab
}
