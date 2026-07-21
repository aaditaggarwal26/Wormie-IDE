import { create } from 'zustand'

export type ThemePreference = 'system' | 'dark' | 'light'
export type ColorVisionPreference = 'standard' | 'red-green' | 'blue-yellow' | 'monochrome'
export type UiFontPreference = 'system' | 'humanist' | 'arial' | 'serif'
export type CodeFontPreference = 'cascadia' | 'sf-mono' | 'consolas' | 'jetbrains' | 'fira' | 'monospace'

export type AppearancePreferences = {
  theme: ThemePreference
  uiFont: UiFontPreference
  codeFont: CodeFontPreference
  uiScale: number
  editorFontSize: number
  editorLineHeight: number
  fontLigatures: boolean
  highContrast: boolean
  reduceMotion: boolean
  colorVision: ColorVisionPreference
}

export const DEFAULT_APPEARANCE: AppearancePreferences = {
  theme: 'system',
  uiFont: 'system',
  codeFont: 'cascadia',
  uiScale: 1,
  editorFontSize: 13,
  editorLineHeight: 1.6,
  fontLigatures: true,
  highContrast: false,
  reduceMotion: false,
  colorVision: 'standard'
}

export const UI_FONT_STACKS: Record<UiFontPreference, string> = {
  system: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  humanist: '"Avenir Next", "Segoe UI", sans-serif',
  arial: 'Arial, Helvetica, sans-serif',
  serif: 'Georgia, "Times New Roman", serif'
}

export const CODE_FONT_STACKS: Record<CodeFontPreference, string> = {
  cascadia: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
  'sf-mono': '"SFMono-Regular", Menlo, Monaco, Consolas, monospace',
  consolas: 'Consolas, "Courier New", monospace',
  jetbrains: '"JetBrains Mono", "Cascadia Code", monospace',
  fira: '"Fira Code", "Cascadia Code", monospace',
  monospace: 'ui-monospace, monospace'
}

const STORAGE_KEY = 'wormie.appearance.v1'
const themes = new Set<ThemePreference>(['system', 'dark', 'light'])
const colorVisions = new Set<ColorVisionPreference>(['standard', 'red-green', 'blue-yellow', 'monochrome'])
const uiFonts = new Set<UiFontPreference>(['system', 'humanist', 'arial', 'serif'])
const codeFonts = new Set<CodeFontPreference>(['cascadia', 'sf-mono', 'consolas', 'jetbrains', 'fira', 'monospace'])

function boundedNumber(value: unknown, fallback: number, min: number, max: number, step: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number(Math.min(max, Math.max(min, Math.round(value / step) * step)).toFixed(decimals))
}

export function normalizeAppearance(value: unknown): AppearancePreferences {
  const input = value && typeof value === 'object' ? value as Partial<AppearancePreferences> : {}
  return {
    theme: themes.has(input.theme as ThemePreference) ? input.theme as ThemePreference : DEFAULT_APPEARANCE.theme,
    uiFont: uiFonts.has(input.uiFont as UiFontPreference) ? input.uiFont as UiFontPreference : DEFAULT_APPEARANCE.uiFont,
    codeFont: codeFonts.has(input.codeFont as CodeFontPreference) ? input.codeFont as CodeFontPreference : DEFAULT_APPEARANCE.codeFont,
    uiScale: boundedNumber(input.uiScale, DEFAULT_APPEARANCE.uiScale, 0.9, 1.25, 0.05),
    editorFontSize: boundedNumber(input.editorFontSize, DEFAULT_APPEARANCE.editorFontSize, 11, 24, 1),
    editorLineHeight: boundedNumber(input.editorLineHeight, DEFAULT_APPEARANCE.editorLineHeight, 1.2, 2, 0.1),
    fontLigatures: typeof input.fontLigatures === 'boolean' ? input.fontLigatures : DEFAULT_APPEARANCE.fontLigatures,
    highContrast: typeof input.highContrast === 'boolean' ? input.highContrast : DEFAULT_APPEARANCE.highContrast,
    reduceMotion: typeof input.reduceMotion === 'boolean' ? input.reduceMotion : DEFAULT_APPEARANCE.reduceMotion,
    colorVision: colorVisions.has(input.colorVision as ColorVisionPreference) ? input.colorVision as ColorVisionPreference : DEFAULT_APPEARANCE.colorVision
  }
}

function loadAppearance(): AppearancePreferences {
  if (typeof window === 'undefined') return DEFAULT_APPEARANCE
  try {
    return normalizeAppearance(JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null'))
  } catch {
    return DEFAULT_APPEARANCE
  }
}

export function resolvedTheme(preferences: AppearancePreferences, systemDark?: boolean): 'dark' | 'light' {
  if (preferences.theme !== 'system') return preferences.theme
  const dark = systemDark ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  return dark ? 'dark' : 'light'
}

export function shouldReduceMotion(preferences: AppearancePreferences, systemReduced?: boolean): boolean {
  const reduced = systemReduced ?? (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  return preferences.reduceMotion || reduced
}

export function editorTheme(preferences: AppearancePreferences): string {
  const theme = resolvedTheme(preferences)
  const base = preferences.highContrast ? `wormie-hc-${theme}` : `wormie-${theme}`
  return preferences.colorVision === 'standard' ? base : `${base}-${preferences.colorVision}`
}

function applyAppearance(preferences: AppearancePreferences): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  const theme = resolvedTheme(preferences)
  root.dataset.theme = theme
  root.dataset.contrast = preferences.highContrast ? 'high' : 'standard'
  root.dataset.colorVision = preferences.colorVision
  root.dataset.reducedMotion = shouldReduceMotion(preferences) ? 'true' : 'false'
  root.style.colorScheme = theme
  root.style.setProperty('--ui-font-family', UI_FONT_STACKS[preferences.uiFont])
  root.style.setProperty('--code-font-family', CODE_FONT_STACKS[preferences.codeFont])
  root.style.setProperty('--ui-scale', String(preferences.uiScale))
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#181818' : '#f5f6f7')
}

type AppearanceState = {
  preferences: AppearancePreferences
  setPreferences: (update: Partial<AppearancePreferences>) => void
  resetPreferences: () => void
}

export const useAppearance = create<AppearanceState>((set) => ({
  preferences: loadAppearance(),
  setPreferences: (update) => set((state) => {
    const preferences = normalizeAppearance({ ...state.preferences, ...update })
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)) } catch { /* Keep current-session preferences. */ }
    applyAppearance(preferences)
    return { preferences }
  }),
  resetPreferences: () => set(() => {
    const preferences = { ...DEFAULT_APPEARANCE }
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(preferences)) } catch { /* Keep current-session preferences. */ }
    applyAppearance(preferences)
    return { preferences }
  })
}))

let initialized = false

export function initializeAppearance(): void {
  applyAppearance(useAppearance.getState().preferences)
  if (initialized || typeof window === 'undefined') return
  initialized = true
  const refresh = () => {
    const preferences = { ...useAppearance.getState().preferences }
    applyAppearance(preferences)
    useAppearance.setState({ preferences })
  }
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', refresh)
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', refresh)
}

export function terminalColors(preferences: AppearancePreferences) {
  const light = resolvedTheme(preferences) === 'light'
  const highContrast = preferences.highContrast
  const base = light ? {
    background: '#ffffff', foreground: highContrast ? '#111111' : '#263238', cursor: '#1769aa', cursorAccent: '#ffffff',
    selectionBackground: '#8bbbe855', black: '#263238', brightBlack: '#5f6b72', red: '#b3261e', brightRed: '#d13b32',
    green: '#287d3c', brightGreen: '#37964f', yellow: '#8a5d00', brightYellow: '#a87500', blue: '#1769aa', brightBlue: '#2f7fc1',
    magenta: '#8246af', brightMagenta: '#9b5fc5', cyan: '#087f8c', brightCyan: '#1597a5', white: '#eef1f3', brightWhite: '#ffffff'
  } : {
    background: highContrast ? '#000000' : '#181818', foreground: '#d0d4d1', cursor: '#79a8d8', cursorAccent: '#181818',
    selectionBackground: '#33507088', black: '#181818', brightBlack: '#858585', red: '#cf836b', brightRed: '#e89a82',
    green: '#75a384', brightGreen: '#8fbc9b', yellow: '#c5a66f', brightYellow: '#d7ba7d', blue: '#79a8d8', brightBlue: '#9ac3e9',
    magenta: '#c586c0', brightMagenta: '#dda2d8', cyan: '#75a7ad', brightCyan: '#9cc5ca', white: '#d0d4d1', brightWhite: '#ffffff'
  }
  if (preferences.colorVision === 'red-green') return { ...base, red: '#cc79a7', brightRed: '#df9ac0', green: '#0072b2', brightGreen: '#56b4e9', yellow: '#e69f00', brightYellow: '#f0bb45' }
  if (preferences.colorVision === 'blue-yellow') return { ...base, red: '#c44536', brightRed: '#dc6b5d', green: '#188977', brightGreen: '#4cab9d', yellow: '#a64d79', brightYellow: '#c2759d' }
  if (preferences.colorVision === 'monochrome') return { ...base, red: base.foreground, brightRed: base.brightWhite, green: base.foreground, brightGreen: base.brightWhite, yellow: base.brightBlack, brightYellow: base.foreground }
  return base
}
