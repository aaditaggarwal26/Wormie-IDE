import { describe, expect, it } from 'vitest'
import { CodexTurnCapture } from './codexTurnCapture'

describe('CodexTurnCapture', () => {
  it('uses completed agent-message text for the matching thread and turn', async () => {
    const capture = new CodexTurnCapture('thread-a')
    capture.accept('item/completed', {
      threadId: 'thread-b',
      turnId: 'turn-a',
      item: { type: 'agentMessage', text: '{"wrong":true}' }
    })
    capture.accept('item/completed', {
      threadId: 'thread-a',
      turnId: 'turn-a',
      item: { type: 'agentMessage', text: '{"ok":true}' }
    })
    capture.accept('turn/completed', {
      threadId: 'thread-a',
      turn: { id: 'turn-a', status: 'completed', error: null }
    })

    await expect(capture.waitForCompletion('turn-a', new AbortController().signal)).resolves.toMatchObject({
      turn: { id: 'turn-a', status: 'completed' }
    })
    expect(capture.outputFor('turn-a')).toBe('{"ok":true}')
  })

  it('falls back to matching agent-message deltas', () => {
    const capture = new CodexTurnCapture('thread-a')
    capture.accept('item/agentMessage/delta', {
      threadId: 'thread-a', turnId: 'turn-a', delta: '{"ok":'
    })
    capture.accept('item/agentMessage/delta', {
      threadId: 'thread-a', turnId: 'turn-a', delta: 'true}'
    })

    expect(capture.outputFor('turn-a')).toBe('{"ok":true}')
    expect(capture.outputFor('turn-b')).toBeNull()
  })

  it('handles completion arriving before the waiter', async () => {
    const capture = new CodexTurnCapture('thread-a')
    capture.accept('turn/completed', {
      threadId: 'thread-a',
      turn: { id: 'turn-a', status: 'completed', error: null }
    })

    await expect(capture.waitForCompletion('turn-a', new AbortController().signal)).resolves.toMatchObject({
      turn: { id: 'turn-a' }
    })
  })

  it('rejects a waiter on cancellation and ignores other turns', async () => {
    const controller = new AbortController()
    const capture = new CodexTurnCapture('thread-a')
    const completion = capture.waitForCompletion('turn-a', controller.signal)
    capture.accept('turn/completed', {
      threadId: 'thread-a',
      turn: { id: 'turn-b', status: 'completed', error: null }
    })
    controller.abort()

    await expect(completion).rejects.toMatchObject({ name: 'AbortError' })
  })

  it('reports only allowlisted protocol metadata', () => {
    const events: Array<[string, string]> = []
    const capture = new CodexTurnCapture('thread-a', (method, detail) => events.push([method, detail]))
    capture.accept('item/started', {
      threadId: 'thread-a', turnId: 'turn-a', item: { type: 'reasoning', text: 'private text' }
    })
    capture.accept('unknown/private', { secret: 'do not expose' })

    expect(events).toEqual([['item/started', 'reasoning']])
  })
})
