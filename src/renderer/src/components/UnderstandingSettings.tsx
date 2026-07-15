import { useEffect, useState } from 'react'
import { Check, LoaderCircle } from 'lucide-react'
import type { UnderstandingSettings as Settings } from '@shared/contracts'

export function UnderstandingSettings(): React.JSX.Element {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void window.desktop.getUnderstandingSettings().then(setSettings).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load quiz settings.')) }, [])
  if (!settings) return <div className="settings-block understanding-settings"><p>{error ?? 'Loading understanding settings…'}</p></div>
  const update = <K extends keyof Settings>(key: K, value: Settings[K]) => { setSettings((current) => current ? { ...current, [key]: value } : current); setSaved(false) }
  const save = async () => {
    setSaving(true); setError(null)
    try { setSettings(await window.desktop.saveUnderstandingSettings(settings)); setSaved(true) }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not save understanding settings.') }
    finally { setSaving(false) }
  }
  return (
    <div className="settings-block understanding-settings">
      <div className="settings-title"><span>Major change checks</span><b>{settings.enabled ? 'Enabled' : 'Disabled'}</b></div>
      <Toggle label="Enable understanding quizzes" checked={settings.enabled} onChange={(value) => update('enabled', value)} />
      <label className="field-label" htmlFor="trigger-level">Trigger for</label>
      <select id="trigger-level" onChange={(event) => update('triggerLevel', event.target.value as Settings['triggerLevel'])} value={settings.triggerLevel}>
        <option value="major">Major and critical</option><option value="minor">Minor, major, and critical</option>
      </select>
      <label className="setting-range" htmlFor="understanding-score"><span>Passing score</span><b>{settings.passingScore}%</b></label>
      <input id="understanding-score" min="60" max="100" step="5" type="range" value={settings.passingScore} onChange={(event) => update('passingScore', Number(event.target.value))} />
      <div className="question-bounds">
        <label>Minimum<input min="2" max={settings.maximumQuestions} type="number" value={settings.minimumQuestions} onChange={(event) => update('minimumQuestions', Number(event.target.value))} /></label>
        <label>Maximum<input min={settings.minimumQuestions} max="8" type="number" value={settings.maximumQuestions} onChange={(event) => update('maximumQuestions', Number(event.target.value))} /></label>
      </div>
      <Toggle label="Gate AI proposal apply" checked={settings.requireBeforeAiApply} onChange={(value) => update('requireBeforeAiApply', value)} />
      <Toggle label="Gate major Git commits" checked={settings.requireBeforeCommit} onChange={(value) => update('requireBeforeCommit', value)} />
      <Toggle label="Allow one retry" checked={settings.allowRetryBeforeRemediation} onChange={(value) => update('allowRetryBeforeRemediation', value)} />
      <Toggle label="Strict mode" checked={settings.strictMode} onChange={(value) => update('strictMode', value)} />
      <Toggle label="Developer bypass" checked={settings.developerBypass} onChange={(value) => update('developerBypass', value)} />
      {settings.developerBypass && <Toggle label="Require bypass reason" checked={settings.bypassRequiresReason} onChange={(value) => update('bypassRequiresReason', value)} />}
      <button className="settings-save" disabled={saving} onClick={save} type="button">{saving ? <LoaderCircle className="spin" size={12} /> : saved ? <Check size={12} /> : null}{saved ? 'Saved' : 'Save quiz settings'}</button>
      {error && <p className="settings-error">{error}</p>}
    </div>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }): React.JSX.Element {
  return <label className="setting-toggle"><span>{label}</span><input checked={checked} onChange={(event) => onChange(event.target.checked)} type="checkbox" /></label>
}
