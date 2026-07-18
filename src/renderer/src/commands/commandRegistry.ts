import { fuzzyMatch } from './fuzzy'

export type CommandDefinition<Context> = {
  id: string
  title: string
  category: string
  shortcut?: Keybinding
  isEnabled: (context: Context) => boolean
  run: (context: Context) => void | Promise<void>
}

export type Keybinding = {
  key: string
  primary?: boolean
  shift?: boolean
  alt?: boolean
}

export type KeyboardInput = {
  key: string
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  altKey: boolean
}

export function matchesKeybinding(input: KeyboardInput, binding: Keybinding, platform: string): boolean {
  const primaryPressed = platform === 'darwin' ? input.metaKey : input.ctrlKey
  const otherPrimaryPressed = platform === 'darwin' ? input.ctrlKey : input.metaKey
  return input.key.toLocaleLowerCase() === binding.key.toLocaleLowerCase() &&
    primaryPressed === Boolean(binding.primary) &&
    !otherPrimaryPressed &&
    input.shiftKey === Boolean(binding.shift) &&
    input.altKey === Boolean(binding.alt)
}

export function formatKeybinding(binding: Keybinding, platform: string): string {
  const parts: string[] = []
  if (binding.primary) parts.push(platform === 'darwin' ? 'Cmd' : 'Ctrl')
  if (binding.shift) parts.push('Shift')
  if (binding.alt) parts.push(platform === 'darwin' ? 'Option' : 'Alt')
  parts.push(binding.key.length === 1 ? binding.key.toLocaleUpperCase() : binding.key)
  return parts.join(' ')
}

export type CommandSearchResult<Context> = {
  command: CommandDefinition<Context>
  enabled: boolean
  score: number
}

export type CommandRegistry<Context> = ReturnType<typeof createCommandRegistry<Context>>

export function createCommandRegistry<Context>(commands: CommandDefinition<Context>[]) {
  const commandById = new Map(commands.map((command) => [command.id, command]))
  if (commandById.size !== commands.length) throw new Error('Command IDs must be unique.')

  return {
    commands,
    search(query: string, context: Context, recentIds: string[]): CommandSearchResult<Context>[] {
      const trimmed = query.trim()
      if (!trimmed) {
        const recentOrder = new Map(recentIds.map((id, index) => [id, index]))
        return commands.map((command, index) => ({
          command,
          enabled: command.isEnabled(context),
          score: recentOrder.has(command.id) ? 10_000 - recentOrder.get(command.id)! : -index
        })).sort((left, right) => right.score - left.score)
      }

      return commands.flatMap((command): CommandSearchResult<Context>[] => {
        const match = fuzzyMatch(`${command.category} ${command.title}`, trimmed)
        return match ? [{ command, enabled: command.isEnabled(context), score: match.score }] : []
      }).sort((left, right) => right.score - left.score || left.command.title.localeCompare(right.command.title))
    },
    async invoke(id: string, context: Context): Promise<boolean> {
      const command = commandById.get(id)
      if (!command || !command.isEnabled(context)) return false
      await command.run(context)
      return true
    },
    findByKeyboard(input: KeyboardInput, platform: string, context: Context): CommandDefinition<Context> | null {
      return commands.find((command) => command.shortcut && matchesKeybinding(input, command.shortcut, platform) && command.isEnabled(context)) ?? null
    }
  }
}
