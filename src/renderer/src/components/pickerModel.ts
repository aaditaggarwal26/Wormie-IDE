export type PickerKeyAction = 'next' | 'previous' | 'select' | 'close' | 'none'

export function movePickerSelection(current: number, count: number, direction: 1 | -1): number {
  if (count <= 0) return -1
  const start = current < 0 ? (direction === 1 ? -1 : 0) : current
  return (start + direction + count) % count
}

export function pickerKeyAction(key: string): PickerKeyAction {
  if (key === 'ArrowDown') return 'next'
  if (key === 'ArrowUp') return 'previous'
  if (key === 'Enter') return 'select'
  if (key === 'Escape') return 'close'
  return 'none'
}
