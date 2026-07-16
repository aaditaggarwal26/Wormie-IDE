type TerminalKeyEvent = Pick<KeyboardEvent, 'type' | 'key' | 'ctrlKey' | 'metaKey' | 'shiftKey' | 'altKey'>

export function shouldHandleTerminalCopy(event: TerminalKeyEvent, platform: string, hasSelection: boolean): boolean {
  if (event.type !== 'keydown' || event.key.toLowerCase() !== 'c' || event.altKey) return false
  if (platform === 'darwin') return event.metaKey
  return event.ctrlKey && !event.metaKey && (event.shiftKey || hasSelection)
}
