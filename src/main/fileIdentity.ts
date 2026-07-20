export type FileIdentity = { dev: bigint; ino: bigint }
export type FileSnapshotIdentity = FileIdentity & { size: bigint; mtimeNs: bigint; ctimeNs: bigint }

export function isSameFileIdentity(
  left: FileIdentity,
  right: FileIdentity,
  platform: NodeJS.Platform = process.platform
): boolean {
  if (left.ino === 0n || right.ino === 0n || left.ino !== right.ino) return false
  return platform === 'win32' || left.dev === right.dev
}

export function isUnchangedFile(
  left: FileSnapshotIdentity,
  right: FileSnapshotIdentity,
  platform: NodeJS.Platform = process.platform
): boolean {
  return isSameFileIdentity(left, right, platform) &&
    left.size === right.size &&
    left.mtimeNs === right.mtimeNs &&
    left.ctimeNs === right.ctimeNs
}
