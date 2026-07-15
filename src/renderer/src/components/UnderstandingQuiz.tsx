import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Check, ExternalLink, LoaderCircle, LockKeyhole, RefreshCw, ShieldCheck, UnlockKeyhole } from 'lucide-react'
import type {
  ChangeUnderstandingPreparation,
  PublicQuizQuestion,
  UnderstandingAnswer,
  UnderstandingGateStatus,
  UnderstandingResult,
  UnderstandingSettings
} from '@shared/contracts'
import { isQuestionAnswered, moveQuestionWithShortcut } from './understandingQuizModel'

type Props = {
  preparation: ChangeUnderstandingPreparation
  onRetry: () => Promise<ChangeUnderstandingPreparation>
  onGateChange?: (gate: UnderstandingGateStatus) => void
  onOpenSource?: (path: string, line?: number) => void
}

export function UnderstandingQuiz({ preparation, onRetry, onGateChange, onOpenSource }: Props): React.JSX.Element {
  const [gate, setGate] = useState(preparation.gate)
  const [answers, setAnswers] = useState<Record<string, UnderstandingAnswer>>(preparation.gate?.draftAnswers ?? {})
  const [result, setResult] = useState<UnderstandingResult | null>(preparation.gate?.lastResult ?? null)
  const [current, setCurrent] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(preparation.generationError ?? null)
  const [settings, setSettings] = useState<UnderstandingSettings | null>(null)
  const [bypassReason, setBypassReason] = useState('')
  const quiz = gate?.quiz
  const question = quiz?.questions[current]

  useEffect(() => {
    setGate(preparation.gate)
    setAnswers(preparation.gate?.draftAnswers ?? {})
    setResult(preparation.gate?.lastResult ?? null)
    setError(preparation.generationError ?? null)
    setCurrent(0)
  }, [preparation.changeId, preparation.fingerprint, preparation.gate?.quiz?.id])

  useEffect(() => { void window.desktop.getUnderstandingSettings().then(setSettings) }, [])

  useEffect(() => {
    if (!quiz || gate?.unlocked || Object.keys(answers).length === 0) return
    const timeout = window.setTimeout(() => {
      void window.desktop.saveUnderstandingAnswers(quiz.id, answers).then((next) => {
        setGate(next)
        onGateChange?.(next)
      }).catch((cause) => setError(cause instanceof Error ? cause.message : 'Could not save quiz progress.'))
    }, 350)
    return () => window.clearTimeout(timeout)
  }, [answers, quiz?.id, gate?.unlocked])

  const complete = useMemo(
    () => Boolean(quiz?.questions.every((candidate) => isQuestionAnswered(candidate, answers[candidate.id]))),
    [quiz, answers]
  )

  const updateAnswer = (value: UnderstandingAnswer['value']) => {
    if (!question) return
    setAnswers((currentAnswers) => ({ ...currentAnswers, [question.id]: { value } }))
    if (result && !result.passed) setResult(null)
  }

  const submit = async () => {
    if (!quiz || !complete) return
    setBusy(true); setError(null)
    try {
      const nextResult = await window.desktop.submitUnderstanding({ quizId: quiz.id, answers })
      const nextGate = await window.desktop.getUnderstandingGate(preparation.changeId, preparation.fingerprint)
      setResult(nextResult)
      if (nextGate) { setGate(nextGate); onGateChange?.(nextGate) }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not grade this understanding check.')
    } finally { setBusy(false) }
  }

  const retry = async () => {
    setBusy(true); setError(null)
    try {
      const next = await onRetry()
      setGate(next.gate); setAnswers({}); setResult(null); setCurrent(0); setError(next.generationError ?? null)
      if (next.gate) onGateChange?.(next.gate)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not generate fresh questions.') }
    finally { setBusy(false) }
  }

  const bypass = async () => {
    if (!quiz) return
    setBusy(true); setError(null)
    try {
      const next = await window.desktop.bypassUnderstanding(quiz.id, bypassReason)
      setGate(next); onGateChange?.(next)
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Could not record the bypass.') }
    finally { setBusy(false) }
  }

  if (!preparation.significance.quizRequired) {
    return <div className="understanding-clear"><Check size={13} /><span>No understanding check required</span><b>{preparation.significance.level}</b></div>
  }

  return (
    <section className="understanding-check" aria-label="Major change understanding check">
      <div className="change-dossier">
        <div className="change-dossier-heading">
          <span className="significance-badge" data-level={preparation.significance.level}>{preparation.significance.level}</span>
          <b><LockKeyhole size={12} /> Understanding required</b>
        </div>
        <p>{quiz?.summary ?? 'This change is locked until a grounded understanding check can be generated.'}</p>
        <dl>
          <div><dt>Files</dt><dd>{preparation.significance.changedFiles.length}</dd></div>
          <div><dt>Impact</dt><dd>{preparation.significance.score}/100</dd></div>
          <div><dt>Time</dt><dd>{quiz ? `~${quiz.estimatedMinutes} min` : '—'}</dd></div>
        </dl>
        <details>
          <summary>Why this was triggered</summary>
          <ul>{preparation.significance.triggerReasons.map((reason) => <li key={reason}>{reason}</li>)}</ul>
        </details>
        {quiz && <div className="change-flow"><b>New flow</b><p>{quiz.flowSummary}</p></div>}
      </div>

      {!quiz && (
        <button className="understanding-action" disabled={busy} onClick={retry} type="button">
          {busy ? <LoaderCircle className="spin" size={13} /> : <RefreshCw size={13} />} Generate understanding check
        </button>
      )}

      {quiz && !gate?.unlocked && question && (
        <div className="question-stage" onKeyDown={(event) => {
          setCurrent((index) => moveQuestionWithShortcut(index, quiz.questions.length, event))
        }}>
          <div className="quiz-progress-row"><span>Question {current + 1} of {quiz.questions.length}</span><b>{Math.round(((current + 1) / quiz.questions.length) * 100)}%</b></div>
          <div className="quiz-progress"><span style={{ width: `${((current + 1) / quiz.questions.length) * 100}%` }} /></div>
          <p className="question-concept">{quiz.concepts.find((concept) => concept.id === question.conceptId)?.name ?? 'Change reasoning'} · {question.difficulty}</p>
          <h4>{question.prompt}</h4>
          {question.code && <pre>{question.code}</pre>}
          <QuestionAnswer question={question} answer={answers[question.id]} onChange={updateAnswer} />
          {question.sourceReferences.length > 0 && <div className="source-references">
            {question.sourceReferences.map((reference) => <button key={`${reference.path}:${reference.startLine ?? 0}`} onClick={() => onOpenSource?.(reference.path, reference.startLine)} type="button"><ExternalLink size={10} />{reference.path}{reference.startLine ? `:${reference.startLine}` : ''}</button>)}
          </div>}
          <div className="question-navigation">
            <button disabled={current === 0} onClick={() => setCurrent((index) => index - 1)} type="button"><ArrowLeft size={13} /> Back</button>
            {current < quiz.questions.length - 1
              ? <button disabled={!isQuestionAnswered(question, answers[question.id])} onClick={() => setCurrent((index) => index + 1)} type="button">Next <ArrowRight size={13} /></button>
              : <button disabled={!complete || busy} onClick={submit} type="button">{busy ? <LoaderCircle className="spin" size={13} /> : <ShieldCheck size={13} />} Check understanding</button>}
          </div>
        </div>
      )}

      {result && !result.passed && (
        <div className="understanding-result" data-passed="false">
          <AlertTriangle size={15} /><div><b>{result.score}% · Review needed</b><p>{result.remediation ?? 'Review the feedback and try once more.'}</p></div>
          {result.feedback.filter((item) => !item.correct).map((item) => <p key={item.questionId}>{item.explanation}</p>)}
          {gate?.state === 'remediation' && <button disabled={busy} onClick={retry} type="button"><RefreshCw size={12} /> Generate fresh questions</button>}
        </div>
      )}

      {gate?.unlocked && (
        <div className="understanding-result" data-passed="true">
          <UnlockKeyhole size={16} /><div><b>Change unlocked</b><p>{gate.state === 'bypassed' ? 'Developer bypass recorded.' : `${gate.lastResult?.score ?? 100}% understanding score · exact change fingerprint verified.`}</p></div>
        </div>
      )}

      {settings?.developerBypass && quiz && !gate?.unlocked && (
        <details className="bypass-panel"><summary>Developer bypass</summary><textarea aria-label="Bypass reason" maxLength={500} onChange={(event) => setBypassReason(event.target.value)} placeholder="Document why this change may proceed…" value={bypassReason} /><button disabled={busy || (settings.bypassRequiresReason && bypassReason.trim().length < 8)} onClick={bypass} type="button">Record bypass</button></details>
      )}
      {error && <p className="understanding-error"><AlertTriangle size={11} />{error}</p>}
    </section>
  )
}

function QuestionAnswer({ question, answer, onChange }: { question: PublicQuizQuestion; answer?: UnderstandingAnswer; onChange: (value: UnderstandingAnswer['value']) => void }): React.JSX.Element {
  if (question.type === 'true_false') return <div className="answer-options">{[true, false].map((value) => <button data-selected={answer?.value === value} key={String(value)} onClick={() => onChange(value)} type="button"><span>{value ? 'T' : 'F'}</span>{value ? 'True' : 'False'}</button>)}</div>
  if (question.type === 'short_answer' || question.type === 'predict_behavior' || question.type === 'spot_the_bug') return <textarea className="written-answer" maxLength={4000} onChange={(event) => onChange(event.target.value)} placeholder="Explain what happens and why…" value={typeof answer?.value === 'string' ? answer.value : ''} />
  if (question.type === 'code_ordering') {
    const selected = Array.isArray(answer?.value) ? answer.value : []
    const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id])
    return <div className="answer-options ordering">{question.options?.map((option) => <button data-selected={selected.includes(option.id)} key={option.id} onClick={() => toggle(option.id)} type="button"><span>{selected.indexOf(option.id) + 1 || '·'}</span>{option.label}</button>)}</div>
  }
  const multiple = question.type === 'multiple_select'
  const selected = Array.isArray(answer?.value) ? answer.value : []
  return <div className="answer-options">{question.options?.map((option, index) => {
    const isSelected = multiple ? selected.includes(option.id) : answer?.value === option.id
    return <button data-selected={isSelected} key={option.id} onClick={() => onChange(multiple ? (isSelected ? selected.filter((id) => id !== option.id) : [...selected, option.id]) : option.id)} type="button"><span>{String.fromCharCode(65 + index)}</span>{option.label}</button>
  })}</div>
}
