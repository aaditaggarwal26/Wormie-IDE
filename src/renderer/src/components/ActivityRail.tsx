import { Braces, ClipboardCheck, FolderTree, GitBranch, Search, Settings2 } from 'lucide-react'
import { useWorkbench } from '@/store/workbench'
import { activityIdsForMode, type IdeActivityId } from './activityItems'

const activityDefinitions: Record<IdeActivityId, { id: IdeActivityId; label: string; icon: typeof FolderTree }> = {
  explorer: { id: 'explorer', label: 'Explorer', icon: FolderTree },
  search: { id: 'search', label: 'Search', icon: Search },
  outline: { id: 'outline', label: 'Outline', icon: Braces },
  sourceControl: { id: 'sourceControl', label: 'Source Control', icon: GitBranch },
  assignments: { id: 'assignments', label: 'Assignment', icon: ClipboardCheck }
}

export function ActivityRail({ assignmentMode }: { assignmentMode: boolean }): React.JSX.Element {
  const activity = useWorkbench((state) => state.activity)
  const setActivity = useWorkbench((state) => state.setActivity)
  const activities = activityIdsForMode(assignmentMode).map((id) => activityDefinitions[id])

  return (
    <nav className="activity-rail" aria-label="Workbench views">
      <div className="worm-mark" aria-label="Wormie">
        <span />
        <span />
        <span />
      </div>

      <div className="activity-group">
        {activities.map(({ id, label, icon: Icon }) => (
          <button
            className="activity-button"
            data-active={activity === id}
            key={id}
            onClick={() => setActivity(id)}
            title={label}
            type="button"
          >
            <Icon size={19} strokeWidth={1.7} />
            <span className="sr-only">{label}</span>
          </button>
        ))}
      </div>

      <button
        className="activity-button activity-settings"
        data-active={activity === 'settings'}
        onClick={() => setActivity('settings')}
        title="Settings"
        type="button"
      >
        <Settings2 size={19} strokeWidth={1.7} />
        <span className="sr-only">Settings</span>
      </button>
    </nav>
  )
}
