export type RecentItems = {
  version: 1
  files: string[]
  commands: string[]
}

export const emptyRecentItems = (): RecentItems => ({ version: 1, files: [], commands: [] })

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 2_000).slice(0, 30)
}

export function parseRecentItems(raw: string | null): RecentItems {
  if (!raw) return emptyRecentItems()
  try {
    const value = JSON.parse(raw) as Record<string, unknown>
    if (value.version !== 1) return emptyRecentItems()
    return { version: 1, files: stringList(value.files), commands: stringList(value.commands) }
  } catch {
    return emptyRecentItems()
  }
}

export function pushRecentItem(items: string[], item: string, maximum = 20): string[] {
  return [item, ...items.filter((value) => value !== item)].slice(0, maximum)
}
