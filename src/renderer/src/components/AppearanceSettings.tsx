import { useState } from 'react'
import { Accessibility, Check, Contrast, Monitor, Moon, RotateCcw, Sun, Type } from 'lucide-react'
import {
  CODE_FONT_STACKS,
  UI_FONT_STACKS,
  resolvedTheme,
  useAppearance,
  type CodeFontPreference,
  type ColorVisionPreference,
  type ThemePreference,
  type UiFontPreference
} from '@/store/appearance'

const themeOptions: Array<{ value: ThemePreference; label: string; icon: typeof Monitor }> = [
  { value: 'system', label: 'System', icon: Monitor },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'light', label: 'Light', icon: Sun }
]

export function AppearanceSettings(): React.JSX.Element {
  const preferences = useAppearance((state) => state.preferences)
  const setPreferences = useAppearance((state) => state.setPreferences)
  const resetPreferences = useAppearance((state) => state.resetPreferences)
  const [resetDone, setResetDone] = useState(false)
  const update = <K extends keyof typeof preferences>(key: K, value: typeof preferences[K]) => {
    setResetDone(false)
    setPreferences({ [key]: value })
  }

  return (
    <div className="appearance-settings">
      <section className="settings-block appearance-section">
        <div className="settings-title"><span><Contrast size={13} /> Appearance</span><b>{resolvedTheme(preferences)}</b></div>
        <fieldset className="appearance-fieldset">
          <legend>Theme</legend>
          <div className="theme-options">
            {themeOptions.map(({ value, label, icon: Icon }) => (
              <button
                aria-pressed={preferences.theme === value}
                data-active={preferences.theme === value}
                key={value}
                onClick={() => update('theme', value)}
                type="button"
              ><Icon size={13} /><span>{label}</span></button>
            ))}
          </div>
        </fieldset>

        <label className="field-label" htmlFor="ui-font">Interface font</label>
        <select id="ui-font" onChange={(event) => update('uiFont', event.target.value as UiFontPreference)} value={preferences.uiFont}>
          <option value="system">System default</option>
          <option value="humanist">Humanist</option>
          <option value="arial">Arial</option>
          <option value="serif">Georgia</option>
        </select>
        <div className="font-sample ui-font-sample" style={{ fontFamily: UI_FONT_STACKS[preferences.uiFont] }}>
          <Type size={13} /><span>Readable tools, focused learning.</span>
        </div>

        <label className="setting-range" htmlFor="ui-scale"><span>Interface scale</span><b>{Math.round(preferences.uiScale * 100)}%</b></label>
        <input
          aria-valuetext={`${Math.round(preferences.uiScale * 100)} percent`}
          id="ui-scale"
          max="1.25"
          min="0.9"
          onChange={(event) => update('uiScale', Number(event.target.value))}
          step="0.05"
          type="range"
          value={preferences.uiScale}
        />
      </section>

      <section className="settings-block appearance-section">
        <div className="settings-title"><span><Type size={13} /> Editor text</span><b>{preferences.editorFontSize}px</b></div>
        <label className="field-label" htmlFor="code-font">Font family</label>
        <select id="code-font" onChange={(event) => update('codeFont', event.target.value as CodeFontPreference)} value={preferences.codeFont}>
          <option value="cascadia">Cascadia Code</option>
          <option value="sf-mono">SF Mono / Menlo</option>
          <option value="consolas">Consolas</option>
          <option value="jetbrains">JetBrains Mono</option>
          <option value="fira">Fira Code</option>
          <option value="monospace">System monospace</option>
        </select>
        <label className="setting-range" htmlFor="editor-font-size"><span>Font size</span><b>{preferences.editorFontSize}px</b></label>
        <input id="editor-font-size" max="24" min="11" onChange={(event) => update('editorFontSize', Number(event.target.value))} type="range" value={preferences.editorFontSize} />
        <label className="setting-range" htmlFor="editor-line-height"><span>Line height</span><b>{preferences.editorLineHeight.toFixed(1)}</b></label>
        <input id="editor-line-height" max="2" min="1.2" onChange={(event) => update('editorLineHeight', Number(event.target.value))} step="0.1" type="range" value={preferences.editorLineHeight} />
        <Toggle checked={preferences.fontLigatures} label="Programming ligatures" onChange={(value) => update('fontLigatures', value)} />
        <div
          aria-label="Editor font preview"
          className="code-font-sample"
          style={{ fontFamily: CODE_FONT_STACKS[preferences.codeFont], fontSize: preferences.editorFontSize, lineHeight: preferences.editorLineHeight }}
        >
          <span aria-hidden="true">1</span><code><i>const</i> lesson = <b>"understand"</b></code>
          <span aria-hidden="true">2</span><code><i>if</i> (ready) learn()</code>
        </div>
        <p className="settings-hint">Editor and terminal use same typography.</p>
      </section>

      <section className="settings-block appearance-section accessibility-section">
        <div className="settings-title"><span><Accessibility size={13} /> Accessibility</span><b>{preferences.highContrast ? 'High contrast' : 'Standard'}</b></div>
        <Toggle checked={preferences.highContrast} label="Increase contrast" onChange={(value) => update('highContrast', value)} />
        <Toggle checked={preferences.reduceMotion} label="Reduce motion" onChange={(value) => update('reduceMotion', value)} />
        <p className="settings-hint">Reduced motion also follows your operating system setting.</p>
        <label className="field-label" htmlFor="color-vision">Color differentiation</label>
        <select id="color-vision" onChange={(event) => update('colorVision', event.target.value as ColorVisionPreference)} value={preferences.colorVision}>
          <option value="standard">Standard</option>
          <option value="red-green">Red–green safe</option>
          <option value="blue-yellow">Blue–yellow safe</option>
          <option value="monochrome">Monochrome</option>
        </select>
        <div aria-label="Current status color preview" className="color-vision-preview">
          <span className="color-status-success">Passed</span>
          <span className="color-status-warning">Review</span>
          <span className="color-status-danger">Error</span>
        </div>
        <p className="settings-hint">Status icons and labels remain visible, so meaning never depends on color alone.</p>
      </section>

      <section className="settings-block appearance-reset-section">
        <button
          className="appearance-reset"
          onClick={() => { resetPreferences(); setResetDone(true) }}
          type="button"
        >{resetDone ? <Check size={13} /> : <RotateCcw size={13} />}{resetDone ? 'Defaults restored' : 'Restore appearance defaults'}</button>
        <p aria-live="polite" className="sr-only">{resetDone ? 'Appearance defaults restored.' : ''}</p>
      </section>
    </div>
  )
}

function Toggle({ checked, label, onChange }: { checked: boolean; label: string; onChange: (value: boolean) => void }): React.JSX.Element {
  return (
    <label className="appearance-toggle">
      <span>{label}</span>
      <input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <i aria-hidden="true" />
    </label>
  )
}
