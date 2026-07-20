import { useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckCircle2, Gauge, ShieldCheck } from 'lucide-react'
import type { UnderstandingOverview } from '@shared/contracts'
import { masteryQueryKeys } from './useMasteryProfile'

export function QuizHistory({ compact = false }: { compact?: boolean }): React.JSX.Element {
  const { data: overview, error } = useQuery<UnderstandingOverview>({
    queryKey: ['understandingHistory'],
    queryFn: window.desktop.getUnderstandingHistory
  })
  const { data: masteryOverview } = useQuery({
    queryKey: masteryQueryKeys.overview(),
    queryFn: window.desktop.getMasteryOverview
  })

  if (error) return <div className="empty-row"><AlertCircle size={14} />{error instanceof Error ? error.message : 'Could not load quiz history.'}</div>
  if (!overview) return <div className="empty-row"><Gauge size={14} />Loading learning history...</div>
  if (compact) {
    const average = masteryOverview?.overallMastery == null ? null : Math.round(masteryOverview.overallMastery)
    return (
      <div className="mastery-summary">
        <div className="knowledge-orbit"><span>{average == null ? '--' : `${average}%`}</span></div>
        <h3>{masteryOverview?.assessedConcepts ? 'Concept mastery' : 'Your profile starts here.'}</h3>
        <p>{masteryOverview?.assessedConcepts ? `${masteryOverview.assessedConcepts} concepts tracked from evidence.` : 'Mastery will grow as checks are completed.'}</p>
        {overview.mastery.slice(0, 5).map((item) => <div className="mastery-row" key={item.conceptId}><span>{item.name}</span><b>{item.mastery}%</b></div>)}
      </div>
    )
  }
  if (overview.history.length === 0) return <div className="empty-row"><AlertCircle size={14} />No major-change quiz has been completed in this workspace.</div>
  return (
    <div className="quiz-history">
      <div className="history-mastery">{overview.mastery.slice(0, 6).map((item) => <div key={item.conceptId}><span>{item.name}</span><b>{item.mastery}%</b></div>)}</div>
      {overview.history.map((entry) => (
        <article key={entry.id}>
          <span className="history-outcome" data-outcome={entry.outcome}>{entry.outcome === 'passed' ? <CheckCircle2 size={12} /> : <ShieldCheck size={12} />}{entry.outcome}</span>
          <div><b>{entry.title}</b><small>{entry.source === 'git_commit' ? 'Git commit' : 'AI proposal'} - {entry.significance} - {new Date(entry.completedAt).toLocaleString()}</small></div>
          <strong>{entry.score === null ? '--' : `${entry.score}%`}</strong>
        </article>
      ))}
    </div>
  )
}
