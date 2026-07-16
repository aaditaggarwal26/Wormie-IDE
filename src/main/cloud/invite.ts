export function inviteCodeFrom(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length > 500) throw new Error('The classroom invitation is too long.')
  const match = trimmed.match(/(?:^|[^a-f0-9])([a-f0-9]{32})(?:$|[^a-f0-9])/i)
  if (!match) throw new Error('Enter a valid Wormie classroom invite link or code.')
  return match[1].toLowerCase()
}

export function classroomInviteLink(value: string): string | null {
  try {
    const url = new URL(value)
    const code = url.pathname.match(/^\/([a-f0-9]{32})\/?$/i)?.[1]
    if (url.protocol !== 'wormie:' || url.hostname !== 'join' || url.username || url.password || url.port || url.search || url.hash || !code) return null
    return `wormie://join/${code.toLowerCase()}`
  } catch {
    return null
  }
}

export function classroomInviteFromArguments(argumentsList: string[]): string | null {
  for (const argument of argumentsList) {
    const invite = classroomInviteLink(argument)
    if (invite) return invite
  }
  return null
}
