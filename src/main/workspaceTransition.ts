export function ensureWorkspaceRequestCurrent(isCurrent?: () => boolean): void {
  if (isCurrent && !isCurrent()) throw new Error('The workspace request is no longer active.')
}
