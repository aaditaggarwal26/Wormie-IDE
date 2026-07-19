import type { WorkspacePurpose } from '../../shared/contracts'

export function usesAssignmentPolicy(purpose: WorkspacePurpose): boolean {
  return purpose === 'assignment'
}
