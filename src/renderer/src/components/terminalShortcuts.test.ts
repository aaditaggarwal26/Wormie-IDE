import { describe, expect, it } from 'vitest'
import { shouldHandleTerminalCopy, shouldHandleTerminalPaste } from './terminalShortcuts'

const event = (input: Partial<KeyboardEvent> = {}): KeyboardEvent => ({
  type: 'keydown',
  key: 'c',
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  altKey: false,
  ...input
} as KeyboardEvent)

describe('terminal copy shortcuts', () => {
  it('handles Ctrl+Shift+C even without a selection so it never becomes an interrupt', () => {
    expect(shouldHandleTerminalCopy(event({ ctrlKey: true, shiftKey: true }), 'win32', false)).toBe(true)
  })

  it('uses Ctrl+C to copy only when text is selected', () => {
    expect(shouldHandleTerminalCopy(event({ ctrlKey: true }), 'win32', true)).toBe(true)
    expect(shouldHandleTerminalCopy(event({ ctrlKey: true }), 'win32', false)).toBe(false)
  })

  it('uses Command+C on macOS and ignores keyup events', () => {
    expect(shouldHandleTerminalCopy(event({ metaKey: true }), 'darwin', true)).toBe(true)
    expect(shouldHandleTerminalCopy(event({ type: 'keyup', metaKey: true }), 'darwin', true)).toBe(false)
  })
})

describe('terminal paste shortcuts', () => {
  it('handles Ctrl+V and Ctrl+Shift+V on Windows', () => {
    expect(shouldHandleTerminalPaste(event({ key: 'v', ctrlKey: true }), 'win32')).toBe(true)
    expect(shouldHandleTerminalPaste(event({ key: 'v', ctrlKey: true, shiftKey: true }), 'win32')).toBe(true)
  })

  it('uses Command+V on macOS and ignores keyup events', () => {
    expect(shouldHandleTerminalPaste(event({ key: 'v', metaKey: true }), 'darwin')).toBe(true)
    expect(shouldHandleTerminalPaste(event({ type: 'keyup', key: 'v', metaKey: true }), 'darwin')).toBe(false)
  })
})
