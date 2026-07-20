export type CapturedTurnCompletion = {
  threadId: string
  turn: {
    id: string
    status: string
    error: null | { message?: string }
  }
}

export type CapturedTokenUsage = {
  inputTokens: number
  cachedInputTokens: number
  outputTokens: number
  reasoningOutputTokens: number
  totalTokens: number
}

type TurnWaiter = {
  resolve: (completion: CapturedTurnCompletion) => void
  reject: (error: Error) => void
  cleanup: () => void
}

const protocolMethods = new Set([
  'item/started',
  'item/completed',
  'item/agentMessage/delta',
  'thread/tokenUsage/updated',
  'turn/completed'
])

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function readTurnCompletion(params: unknown): CapturedTurnCompletion | null {
  const record = asRecord(params)
  const turn = asRecord(record?.turn)
  if (!record || typeof record.threadId !== 'string' || !turn || typeof turn.id !== 'string' || typeof turn.status !== 'string') {
    return null
  }
  const rawError = asRecord(turn.error)
  return {
    threadId: record.threadId,
    turn: {
      id: turn.id,
      status: turn.status,
      error: rawError ? { message: typeof rawError.message === 'string' ? rawError.message : undefined } : null
    }
  }
}

function readTokenCount(record: Record<string, unknown>, key: string): number | null {
  const value = record[key]
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 ? value : null
}

function readTokenUsage(params: unknown): { turnId: string; usage: CapturedTokenUsage } | null {
  const record = asRecord(params)
  const tokenUsage = asRecord(record?.tokenUsage)
  const last = asRecord(tokenUsage?.last)
  if (!record || typeof record.turnId !== 'string' || !last) return null
  const inputTokens = readTokenCount(last, 'inputTokens')
  const cachedInputTokens = readTokenCount(last, 'cachedInputTokens')
  const outputTokens = readTokenCount(last, 'outputTokens')
  const reasoningOutputTokens = readTokenCount(last, 'reasoningOutputTokens')
  const totalTokens = readTokenCount(last, 'totalTokens')
  if ([inputTokens, cachedInputTokens, outputTokens, reasoningOutputTokens, totalTokens].some((value) => value === null)) return null
  return {
    turnId: record.turnId,
    usage: { inputTokens: inputTokens!, cachedInputTokens: cachedInputTokens!, outputTokens: outputTokens!, reasoningOutputTokens: reasoningOutputTokens!, totalTokens: totalTokens! }
  }
}

export class CodexTurnCapture {
  private readonly completedText = new Map<string, string>()
  private readonly deltaText = new Map<string, string>()
  private readonly completions = new Map<string, CapturedTurnCompletion>()
  private readonly tokenUsage = new Map<string, CapturedTokenUsage>()
  private readonly waiters = new Map<string, TurnWaiter>()

  constructor(
    private readonly threadId: string,
    private readonly onProtocolEvent?: (method: string, detail: string) => void
  ) {}

  accept(method: string, params: unknown): void {
    if (!protocolMethods.has(method)) return
    const record = asRecord(params)
    if (!record || record.threadId !== this.threadId) return

    if (method === 'thread/tokenUsage/updated') {
      const update = readTokenUsage(params)
      if (!update) return
      this.tokenUsage.set(update.turnId, update.usage)
      this.onProtocolEvent?.(method, 'tokenUsage')
      return
    }

    if (method === 'turn/completed') {
      const completion = readTurnCompletion(params)
      if (!completion) return
      this.onProtocolEvent?.(method, completion.turn.status)
      this.completions.set(completion.turn.id, completion)
      const waiter = this.waiters.get(completion.turn.id)
      if (waiter) {
        waiter.cleanup()
        waiter.resolve(completion)
      }
      return
    }

    if (typeof record.turnId !== 'string') return
    const turnId = record.turnId
    if (method === 'item/agentMessage/delta') {
      if (typeof record.delta !== 'string') return
      this.deltaText.set(turnId, `${this.deltaText.get(turnId) ?? ''}${record.delta}`)
      this.onProtocolEvent?.(method, 'agentMessage')
      return
    }

    const item = asRecord(record.item)
    if (!item || typeof item.type !== 'string') return
    this.onProtocolEvent?.(method, item.type.slice(0, 80))
    if (method === 'item/completed' && item.type === 'agentMessage' && typeof item.text === 'string' && item.text.trim()) {
      this.completedText.set(turnId, item.text)
    }
  }

  waitForCompletion(turnId: string, signal: AbortSignal): Promise<CapturedTurnCompletion> {
    const completed = this.completions.get(turnId)
    if (completed) return Promise.resolve(completed)

    return new Promise<CapturedTurnCompletion>((resolve, reject) => {
      const abort = () => {
        cleanup()
        reject(new DOMException('The Codex request was cancelled.', 'AbortError'))
      }
      const cleanup = () => {
        signal.removeEventListener('abort', abort)
        this.waiters.delete(turnId)
      }
      this.waiters.set(turnId, { resolve, reject, cleanup })
      signal.addEventListener('abort', abort, { once: true })
      if (signal.aborted) abort()
    })
  }

  outputFor(turnId: string): string | null {
    return this.completedText.get(turnId) ?? this.deltaText.get(turnId) ?? null
  }

  usageFor(turnId: string): CapturedTokenUsage | null {
    return this.tokenUsage.get(turnId) ?? null
  }

  dispose(error = new Error('The Codex turn capture was closed.')): void {
    for (const waiter of this.waiters.values()) {
      waiter.cleanup()
      waiter.reject(error)
    }
    this.waiters.clear()
  }
}
