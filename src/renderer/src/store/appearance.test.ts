import { describe, expect, it } from 'vitest'
import { DEFAULT_APPEARANCE, normalizeAppearance, resolvedTheme, shouldReduceMotion } from './appearance'

describe('appearance preferences', () => {
  it('normalizes untrusted stored values', () => {
    expect(normalizeAppearance({ theme: 'neon', uiScale: 9, editorFontSize: 5, editorLineHeight: 1.74 })).toEqual({
      ...DEFAULT_APPEARANCE,
      uiScale: 1.25,
      editorFontSize: 11,
      editorLineHeight: 1.7
    })
  })

  it('resolves system and explicit themes', () => {
    expect(resolvedTheme(DEFAULT_APPEARANCE, true)).toBe('dark')
    expect(resolvedTheme(DEFAULT_APPEARANCE, false)).toBe('light')
    expect(resolvedTheme({ ...DEFAULT_APPEARANCE, theme: 'light' }, true)).toBe('light')
  })

  it('honors app and system reduced-motion settings', () => {
    expect(shouldReduceMotion(DEFAULT_APPEARANCE, true)).toBe(true)
    expect(shouldReduceMotion({ ...DEFAULT_APPEARANCE, reduceMotion: true }, false)).toBe(true)
    expect(shouldReduceMotion(DEFAULT_APPEARANCE, false)).toBe(false)
  })
})
