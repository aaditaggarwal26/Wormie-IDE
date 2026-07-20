import { useMemo, useState } from 'react'
import { formatKeybinding } from '@/commands/commandRegistry'
import { workbenchCommandRegistry, type WorkbenchCommandContext } from '@/commands/workbenchCommands'
import { WorkbenchPicker, type WorkbenchPickerItem } from './WorkbenchPicker'

type Props = {
  context: WorkbenchCommandContext
  onClose: () => void
  onRecentCommand: (commandId: string) => void
  platform: string
  recentCommands: string[]
}

export function CommandPalette({ context, onClose, onRecentCommand, platform, recentCommands }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const results = useMemo(
    () => workbenchCommandRegistry.search(query, context, recentCommands),
    [context, query, recentCommands]
  )
  const items: WorkbenchPickerItem[] = results.map(({ command, enabled }) => ({
    id: command.id,
    label: command.title,
    description: command.category,
    shortcut: command.shortcut ? formatKeybinding(command.shortcut, platform) : undefined,
    disabled: !enabled
  }))

  return (
    <WorkbenchPicker
      ariaLabel="Command Palette"
      emptyMessage="No matching commands."
      footer={`${items.length} commands`}
      items={items}
      onClose={onClose}
      onQueryChange={setQuery}
      onSelect={(item) => {
        void workbenchCommandRegistry.invoke(item.id, context).then((invoked) => {
          if (invoked) onRecentCommand(item.id)
        })
        onClose()
      }}
      placeholder="Type a command"
      query={query}
    />
  )
}
