import { create } from 'zustand'
import type { WorkspacePurpose } from '@shared/contracts'

export type ClassroomPortalTab = 'assignments' | 'people' | 'mastery' | 'analytics' | 'settings'

export type AssignmentModeContext = {
  classroomId: string
  classroomName: string
  assignmentId: string | null
  assignmentTitle: string
  role: 'teacher' | 'student'
}

export type ApplicationMode =
  | { kind: 'launcher' }
  | { kind: 'sandbox' }
  | { kind: 'classrooms'; classroomId: string | null; tab: ClassroomPortalTab }
  | { kind: 'assignment'; context: AssignmentModeContext }

type ApplicationNavigationState = {
  mode: ApplicationMode
  transitionId: number
  showLauncher: () => void
  leaveIde: () => void
  openSandbox: () => void
  openClassrooms: (classroomId?: string | null, tab?: ClassroomPortalTab) => void
  beginTransition: () => number
  openAssignment: (transitionId: number, context: AssignmentModeContext) => boolean
  isCurrentTransition: (transitionId: number) => boolean
  reset: () => void
}

const launcherMode = (): ApplicationMode => ({ kind: 'launcher' })

export function workspacePurposeForMode(mode: ApplicationMode): WorkspacePurpose {
  return mode.kind === 'assignment' ? 'assignment' : 'sandbox'
}

export function shouldRetainDraftWorkspace(mode: ApplicationMode, hasSavedManifest: boolean): boolean {
  return mode.kind === 'assignment' &&
    mode.context.role === 'teacher' &&
    mode.context.assignmentId === null &&
    hasSavedManifest
}

export const useApplicationNavigation = create<ApplicationNavigationState>((set, get) => ({
  mode: launcherMode(),
  transitionId: 0,
  showLauncher: () => set((state) => ({ mode: launcherMode(), transitionId: state.transitionId + 1 })),
  leaveIde: () => set((state) => ({
    mode: state.mode.kind === 'assignment'
      ? { kind: 'classrooms', classroomId: state.mode.context.classroomId, tab: 'assignments' }
      : launcherMode(),
    transitionId: state.transitionId + 1
  })),
  openSandbox: () => set((state) => ({ mode: { kind: 'sandbox' }, transitionId: state.transitionId + 1 })),
  openClassrooms: (classroomId = null, tab = 'assignments') => set((state) => ({
    mode: { kind: 'classrooms', classroomId, tab },
    transitionId: state.transitionId + 1
  })),
  beginTransition: () => {
    const transitionId = get().transitionId + 1
    set({ transitionId })
    return transitionId
  },
  openAssignment: (transitionId, context) => {
    if (get().transitionId !== transitionId) return false
    set({ mode: { kind: 'assignment', context } })
    return true
  },
  isCurrentTransition: (transitionId) => get().transitionId === transitionId,
  reset: () => set((state) => ({ mode: launcherMode(), transitionId: state.transitionId + 1 }))
}))
