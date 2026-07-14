import { BookOpenText, FolderTree, GitBranch, Search, Settings2 } from 'lucide-react'
import { useWorkbench } from '@/store/workbench'

const activities = [
  { id: 'explorer' as const, label: 'Explorer', icon: FolderTree },
  { id: 'search' as const, label: 'Search', icon: Search },
  { id: 'sourceControl' as const, label: 'Source Control', icon: GitBranch },
  { id: 'learning' as const, label: 'Knowledge', icon: BookOpenText }
]

export function ActivityRail(): React.JSX.Element {
  const activity = useWorkbench((state) => state.activity)
  const setActivity = useWorkbench((state) => state.setActivity)

  return (
    <nav className="activity-rail" aria-label="Workbench views">
      <div className="worm-mark" aria-label="Learn Before You Code">
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
