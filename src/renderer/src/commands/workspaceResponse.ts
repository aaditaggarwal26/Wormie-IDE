export function isCurrentWorkspaceResponse(expectedRoot: string, responseRoot: string): boolean {
  return expectedRoot === responseRoot
}
