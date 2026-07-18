export async function withRequestTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1) throw new Error('The request timeout is invalid.')
  let timeout: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs)
      })
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
  }
}

export function isCurrentWorkspaceRequest(
  expectedRoot: string,
  expectedGeneration: number,
  currentRoot: string | null | undefined,
  currentGeneration: number
): boolean {
  return expectedRoot === currentRoot && expectedGeneration === currentGeneration
}
