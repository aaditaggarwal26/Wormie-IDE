import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, Gauge, ShieldCheck } from 'lucide-react'
import type { UnderstandingOverview } from '@shared/contracts'

export function QuizHistory({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const [overview, setOverview] = useState<UnderstandingOverview | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { void window.desktop.getUnderstandingHistory().then(setOverview).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not load quiz history.')) }, [])
  if (error) return <div className="empty-row"><AlertCircle size={14} />{error}</div>
  if (!overview) return <div className="empty-row"><Gauge size={14} />Loading learning history…</div>
  if (compact) {
    const average = overview.mastery.length ? Math.round(overview.mastery.reduce((sum, item) => sum + item.mastery, 0) / overview.mastery.length) : 0
    return <div className="mastery-summary"><div className="knowledge-orbit"><span>{average}%</span></div><h3>{overview.mastery.length ? 'Concept mastery' : 'Your profile starts here.'}</h3><p>{overview.mastery.length ? `${overview.mastery.length} change concepts tracked from completed checks.` : 'Mastery will grow as change quizzes are completed.'}</p>{overview.mastery.slice(0, 5).map((item) => <div className="mastery-row" key={item.conceptId}><span>{item.name}</span><b>{item.mastery}%</b></div>)}</div>
  }
  if (overview.history.length === 0) return <div className="empty-row"><AlertCircle size={14} />No major-change quiz has been completed in this workspace.</div>
  return <div className="quiz-history"><div className="history-mastery">{overview.mastery.slice(0, 6).map((item) => <div key={item.conceptId}><span>{item.name}</span><b>{item.mastery}%</b></div>)}</div>{overview.history.map((entry) => <article key={entry.id}><span className="history-outcome" data-outcome={entry.outcome}>{entry.outcome === 'passed' ? <CheckCircle2 size={12} /> : <ShieldCheck size={12} />}{entry.outcome}</span><div><b>{entry.title}</b><small>{entry.source === 'git_commit' ? 'Git commit' : 'AI proposal'} · {entry.significance} · {new Date(entry.completedAt).toLocaleString()}</small></div><strong>{entry.score === null ? '—' : `${entry.score}%`}</strong></article>)}</div>
}
