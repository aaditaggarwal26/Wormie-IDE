export type IdeActivityId = 'explorer' | 'search' | 'outline' | 'sourceControl' | 'assignments'

const sandboxActivityIds: IdeActivityId[] = ['explorer', 'search', 'outline', 'sourceControl']

export function activityIdsForMode(assignmentMode: boolean): IdeActivityId[] {
  return assignmentMode ? [...sandboxActivityIds, 'assignments'] : [...sandboxActivityIds]
}
