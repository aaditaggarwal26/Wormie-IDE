import { useMemo, useState, type ReactNode } from 'react'
import {
  AlertCircle,
  BookMarked,
  BrainCircuit,
  Check,
  ChevronRight,
  CircleDot,
  Flame,
  Gauge,
  GraduationCap,
  Layers3,
  LineChart,
  LoaderCircle,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Target,
  Trophy
} from 'lucide-react'
import type { ConceptDetailView, ConceptDomain, LearningGoalInput, MasteryConceptView, ReviewQuestion, ReviewSession } from '@shared/contracts'
import {
  STATUS_LABELS,
  type ConceptFilter,
  type ConceptSort,
  confidenceLabel,
  emptyProfileMessage,
  evidenceSummary,
  filterConcepts,
  growthLabel,
  masteryPercent,
  reviewRiskLabel,
  sortConcepts,
  sortDomains
} from './masteryProfileModel'
import { useMasteryInvalidation, useMasteryMutations, useMasteryProfile } from './useMasteryProfile'

type Tab = 'map' | 'reviews' | 'goals'

const FILTERS: Array<{ id: ConceptFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'weak', label: 'Weak' },
  { id: 'review', label: 'Review' },
  { id: 'strong', label: 'Strong' }
]

const SORTS: Array<{ id: ConceptSort; label: string }> = [
  { id: 'priority', label: 'Priority' },
  { id: 'mastery', label: 'Mastery' },
  { id: 'recent', label: 'Recent' }
]

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : 'Could not load the knowledge profile.'
}

function domainLabel(domain: ConceptDomain): string {
  return domain.split('-').map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ')
}

export function KnowledgeProfile(): React.JSX.Element {
  useMasteryInvalidation()
  const [tab, setTab] = useState<Tab>('map')
  const [filter, setFilter] = useState<ConceptFilter>('all')
  const [sort, setSort] = useState<ConceptSort>('priority')
  const [selectedConceptId, setSelectedConceptId] = useState<string | null>(null)
  const [reviewSession, setReviewSession] = useState<ReviewSession | null>(null)
  const [reviewAnswers, setReviewAnswers] = useState<Record<string, number>>({})
  const [newGoal, setNewGoal] = useState('')
  const profile = useMasteryProfile(selectedConceptId)
  const mutations = useMasteryMutations()
  const overview = profile.overview.data
  const domains = profile.domains.data ?? []
  const reviews = profile.reviews.data ?? []
  const detail = profile.detail.data ?? null
  const misconceptions = profile.misconceptions.data ?? []
  const goals = profile.goals.data ?? []
  const gamification = profile.gamification.data ?? overview?.gamification
  const sync = profile.sync.data
  const error = profile.overview.error ?? profile.domains.error ?? profile.reviews.error

  const concepts = useMemo(() => {
    const seen = new Map<string, MasteryConceptView>()
    for (const item of [...(overview?.reviewDue ?? []), ...(overview?.weakConcepts ?? []), ...(overview?.strongConcepts ?? [])]) seen.set(item.conceptId, item)
    return sortConcepts(filterConcepts([...seen.values()], filter), sort)
  }, [filter, overview, sort])

  const startReview = (conceptId: string) => {
    mutations.startReview.mutate(conceptId, {
      onSuccess: (session) => {
        setReviewSession(session)
        setReviewAnswers({})
        setTab('reviews')
      }
    })
  }

  const submitReview = () => {
    if (!reviewSession) return
    mutations.submitReview.mutate({ sessionId: reviewSession.id, answers: reviewAnswers }, {
      onSuccess: () => {
        setReviewSession(null)
        setReviewAnswers({})
      }
    })
  }

  const saveGoal = () => {
    const title = newGoal.trim()
    if (!title) return
    const goal: LearningGoalInput = {
      id: crypto.randomUUID(),
      title,
      type: 'mastery',
      target: selectedConceptId ? 80 : 1,
      conceptId: selectedConceptId ?? undefined
    }
    mutations.upsertGoal.mutate(goal, { onSuccess: () => setNewGoal('') })
  }

  if (error) {
    return (
      <aside className="side-panel info-panel knowledge-profile">
        <ProfileHeading syncLabel={sync?.state ?? 'local-only'} />
        <div className="mastery-error"><AlertCircle size={15} />{errorText(error)}</div>
      </aside>
    )
  }

  return (
    <aside className="side-panel info-panel knowledge-profile">
      <ProfileHeading syncLabel={sync?.state ?? 'local-only'} />
      {!overview ? (
        <div className="mastery-loading"><LoaderCircle className="spin" size={16} /> Loading profile</div>
      ) : (
        <div className="knowledge-scroll">
          <section className="mastery-hero" data-empty={overview.assessedConcepts === 0}>
            <div className="mastery-orbit" title={confidenceLabel(overview.overallConfidence)}>
              <span>{masteryPercent(overview.overallMastery)}</span>
              <i>{Math.round(overview.overallConfidence * 100)}%</i>
            </div>
            <div>
              <p className="mastery-kicker">Evidence-weighted profile</p>
              <h3>{overview.assessedConcepts > 0 ? `${overview.assessedConcepts} concepts assessed` : 'Profile starts with evidence'}</h3>
              <p>{emptyProfileMessage(overview) || `${overview.unassessedConcepts} concepts left unmapped. ${growthLabel(overview)}`}</p>
            </div>
          </section>

          <div className="mastery-stats">
            <Stat icon={<Flame size={13} />} label="Daily" value={`${gamification?.dailyStreak ?? 0}`} />
            <Stat icon={<Trophy size={13} />} label="Level" value={`${gamification?.level ?? 1}`} />
            <Stat icon={<ShieldCheck size={13} />} label="Due" value={`${overview.reviewDueConcepts}`} />
          </div>

          <div className="profile-tabs" role="tablist" aria-label="Knowledge profile views">
            <button data-active={tab === 'map'} onClick={() => setTab('map')} type="button"><Layers3 size={13} /> Map</button>
            <button data-active={tab === 'reviews'} onClick={() => setTab('reviews')} type="button"><RefreshCw size={13} /> Review</button>
            <button data-active={tab === 'goals'} onClick={() => setTab('goals')} type="button"><Target size={13} /> Goals</button>
          </div>

          {tab === 'map' && (
            <>
              <section className="domain-map" aria-label="Domain mastery">
                {sortDomains(domains).map((domain) => (
                  <button
                    data-empty={domain.mastery === null}
                    key={domain.domain}
                    title={`${domain.assessedConcepts}/${domain.totalConcepts} concepts assessed`}
                    type="button"
                  >
                    <span>{domainLabel(domain.domain)}</span>
                    <b>{masteryPercent(domain.mastery)}</b>
                    <i style={{ width: `${domain.mastery ?? 0}%` }} />
                  </button>
                ))}
              </section>

              <div className="mastery-controls">
                <div>{FILTERS.map((item) => <button data-active={filter === item.id} key={item.id} onClick={() => setFilter(item.id)} type="button">{item.label}</button>)}</div>
                <select aria-label="Sort concepts" onChange={(event) => setSort(event.target.value as ConceptSort)} value={sort}>
                  {SORTS.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
                </select>
              </div>

              <ConceptList concepts={concepts} onSelect={setSelectedConceptId} selectedConceptId={selectedConceptId} />
              {detail && <ConceptDetail detail={detail} onReview={startReview} />}
            </>
          )}

          {tab === 'reviews' && (
            <section className="review-panel">
              {reviewSession
                ? <ReviewSessionCard
                    answers={reviewAnswers}
                    busy={mutations.submitReview.isPending}
                    onAnswer={(questionId, value) => setReviewAnswers((current) => ({ ...current, [questionId]: value }))}
                    onCancel={() => { setReviewSession(null); setReviewAnswers({}) }}
                    onSubmit={submitReview}
                    session={reviewSession}
                  />
                : reviews.length === 0
                  ? <div className="mastery-empty"><Check size={15} />No reviews due right now.</div>
                  : reviews.map((item) => (
                    <button className="review-row" key={item.concept.conceptId} onClick={() => startReview(item.concept.conceptId)} type="button">
                      <RefreshCw size={13} />
                      <span><b>{item.concept.name}</b><small>{reviewRiskLabel(item)} · {item.overdueDays}d overdue</small></span>
                      <ChevronRight size={13} />
                    </button>
                  ))}
            </section>
          )}

          {tab === 'goals' && (
            <section className="goal-panel">
              <div className="goal-composer">
                <input maxLength={90} onChange={(event) => setNewGoal(event.target.value)} placeholder="Practice async error handling" value={newGoal} />
                <button disabled={!newGoal.trim() || mutations.upsertGoal.isPending} onClick={saveGoal} title="Add goal" type="button"><Plus size={13} /></button>
              </div>
              {goals.length === 0 && <div className="mastery-empty"><Target size={15} />No active goals yet.</div>}
              {goals.map((goal) => (
                <article className="goal-row" key={goal.id} data-completed={Boolean(goal.completedAt)}>
                  <Target size={13} />
                  <span><b>{goal.title}</b><small>{goal.type} · target {goal.target}</small></span>
                  {!goal.completedAt && <button onClick={() => mutations.completeGoal.mutate(goal.id)} title="Complete goal" type="button"><Check size={12} /></button>}
                </article>
              ))}
              {misconceptions.length > 0 && (
                <div className="misconception-list">
                  <p>Watchlist</p>
                  {misconceptions.slice(0, 4).map((item) => <span key={item.id}><AlertCircle size={11} />{item.summary}</span>)}
                </div>
              )}
            </section>
          )}
        </div>
      )}
    </aside>
  )
}

function ProfileHeading({ syncLabel }: { syncLabel: string }): React.JSX.Element {
  return (
    <div className="panel-heading mastery-heading">
      <span>Knowledge</span>
      <b title="Profile sync state"><CircleDot size={8} />{syncLabel}</b>
    </div>
  )
}

function Stat({ icon, label, value }: { icon: ReactNode; label: string; value: string }): React.JSX.Element {
  return <div><span>{icon}{label}</span><b>{value}</b></div>
}

function ConceptList({
  concepts,
  onSelect,
  selectedConceptId
}: {
  concepts: MasteryConceptView[]
  onSelect: (conceptId: string) => void
  selectedConceptId: string | null
}): React.JSX.Element {
  if (concepts.length === 0) return <div className="mastery-empty"><BrainCircuit size={15} />No concepts match this view.</div>
  return (
    <section className="concept-matrix" aria-label="Concept mastery">
      {concepts.map((concept) => (
        <button data-active={selectedConceptId === concept.conceptId} data-status={concept.status} key={concept.conceptId} onClick={() => onSelect(concept.conceptId)} type="button">
          <span><b>{concept.name}</b><small>{domainLabel(concept.domain)} · {STATUS_LABELS[concept.status]}</small></span>
          <i title={confidenceLabel(concept.confidence)}>{Math.round(concept.mastery)}%</i>
          {concept.status === 'review_due' && <em>Due</em>}
        </button>
      ))}
    </section>
  )
}

function ConceptDetail({ detail, onReview }: { detail: ConceptDetailView; onReview: (conceptId: string) => void }): React.JSX.Element {
  return (
    <section className="concept-detail">
      <div className="concept-detail-title">
        <BookMarked size={14} />
        <span><b>{detail.concept.name}</b><small>{detail.recommendedAction.replaceAll('-', ' ')}</small></span>
        {detail.recommendedAction === 'start-review' && <button onClick={() => onReview(detail.concept.conceptId)} type="button"><RefreshCw size={12} /></button>}
      </div>
      <p>{detail.concept.description}</p>
      {detail.reasons.slice(0, 3).map((reason) => <small key={reason}>{reason}</small>)}
      <div className="evidence-strip">
        {evidenceSummary(detail.evidence).map((item) => <span key={item.label}>{item.label}<b>{item.count}</b></span>)}
        {detail.evidence.length === 0 && <span>No evidence yet</span>}
      </div>
      {detail.prerequisites.length > 0 && (
        <div className="prereq-row">
          <GraduationCap size={12} />
          <span>{detail.prerequisites.slice(0, 2).map((concept) => concept.name).join(', ')}</span>
        </div>
      )}
      {detail.scoreHistory.length > 1 && (
        <div className="sparkline" aria-label="Score history">
          <LineChart size={12} />
          {detail.scoreHistory.slice(-8).map((point) => <i key={point.evidenceId} style={{ height: `${Math.max(10, point.mastery)}%` }} title={`${Math.round(point.mastery)}%`} />)}
        </div>
      )}
    </section>
  )
}

function ReviewSessionCard({
  answers,
  busy,
  onAnswer,
  onCancel,
  onSubmit,
  session
}: {
  answers: Record<string, number>
  busy: boolean
  onAnswer: (questionId: string, value: number) => void
  onCancel: () => void
  onSubmit: () => void
  session: ReviewSession
}): React.JSX.Element {
  const complete = session.questions.every((question) => answers[question.id] !== undefined)
  return (
    <article className="review-session-card">
      <div className="concept-detail-title">
        <Sparkles size={14} />
        <span><b>{session.title}</b><small>{session.questions.length} spaced review questions</small></span>
        <button onClick={onCancel} type="button">Close</button>
      </div>
      {session.questions.map((question) => <ReviewQuestionCard answer={answers[question.id]} key={question.id} onAnswer={(value) => onAnswer(question.id, value)} question={question} />)}
      <button className="agent-primary" disabled={!complete || busy} onClick={onSubmit} type="button">{busy ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />} Submit review</button>
    </article>
  )
}

function ReviewQuestionCard({ answer, onAnswer, question }: { answer?: number; onAnswer: (value: number) => void; question: ReviewQuestion }): React.JSX.Element {
  return (
    <fieldset className="profile-review-question">
      <legend>{question.prompt}</legend>
      {question.options.map((option, index) => (
        <button data-selected={answer === index} key={`${question.id}:${index}`} onClick={() => onAnswer(index)} type="button">
          <span>{String.fromCharCode(65 + index)}</span>{option}
        </button>
      ))}
    </fieldset>
  )
}
