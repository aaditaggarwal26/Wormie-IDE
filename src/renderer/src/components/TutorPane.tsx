import { useMemo, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import {
  AlertTriangle,
  BrainCircuit,
  Check,
  ChevronDown,
  FileCode2,
  LoaderCircle,
  LockKeyhole,
  RotateCcw,
  Send,
  ShieldCheck,
  Square,
  UnlockKeyhole
} from 'lucide-react'
import { useWorkbench } from '@/store/workbench'
import type { CodeProposal, LearningSession, QuizResult } from '@shared/contracts'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected AI error occurred.'
}

export function TutorPane(): React.JSX.Element {
  const [request, setRequest] = useState('')
  const [session, setSession] = useState<LearningSession | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null)
  const [quizAttempts, setQuizAttempts] = useState(0)
  const [proposal, setProposal] = useState<CodeProposal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const workspace = useWorkbench((state) => state.workspace)
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const setWorkspace = useWorkbench((state) => state.setWorkspace)
  const updateDocument = useWorkbench((state) => state.updateDocument)
  const markSaved = useWorkbench((state) => state.markSaved)
  const addOutput = useWorkbench((state) => state.addOutput)
  const dirtyDocuments = useMemo(
    () => documents.filter((document) => document.content !== document.savedContent),
    [documents]
  )

  const learningMutation = useMutation({
    mutationFn: () => window.desktop.startLearning({
      request,
      activePath,
      openPaths: documents.map((document) => document.path)
    }),
    onMutate: () => setError(null),
    onSuccess: (nextSession) => {
      setSession(nextSession)
      setAnswers({})
      setQuizResult(null)
      setQuizAttempts(0)
      setProposal(null)
    },
    onError: (cause) => setError(errorMessage(cause))
  })

  const quizMutation = useMutation({
    mutationFn: () => window.desktop.submitQuiz({ sessionId: session!.id, answers }),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      setQuizResult(result)
      setQuizAttempts((attempts) => attempts + 1)
    },
    onError: (cause) => setError(errorMessage(cause))
  })

  const proposalMutation = useMutation({
    mutationFn: () => window.desktop.generateProposal(session!.id),
    onMutate: () => setError(null),
    onSuccess: setProposal,
    onError: (cause) => setError(errorMessage(cause))
  })

  const applyMutation = useMutation({
    mutationFn: () => window.desktop.applyProposal(proposal!.id),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      if (!result.applied) return
      setWorkspace(result.workspace)
      result.changedPaths.forEach((filePath, index) => {
        const document = documents.find((candidate) => candidate.path === filePath)
        const change = proposal?.changes[index]
        if (document && change) {
          updateDocument(filePath, change.content)
          markSaved(filePath)
        }
      })
      addOutput(`Applied AI proposal to ${result.changedPaths.length} file${result.changedPaths.length === 1 ? '' : 's'}.`)
    },
    onError: (cause) => setError(errorMessage(cause))
  })

  const busy = learningMutation.isPending || quizMutation.isPending || proposalMutation.isPending || applyMutation.isPending
  const stage = proposal
    ? 'Review'
    : quizResult?.passed
      ? 'Unlocked'
      : session
        ? 'Learning'
        : 'Idle'

  const reset = () => {
    if (busy) window.desktop.cancelAgent()
    setSession(null)
    setAnswers({})
    setQuizResult(null)
    setQuizAttempts(0)
    setProposal(null)
    setError(null)
  }

  return (
    <aside className="tutor-pane">
      <div className="tutor-heading">
        <div>
          <span className="eyebrow">AI Copilot</span>
          <h2>Learning gate</h2>
        </div>
        <div className="tutor-status" data-busy={busy}><span /> {stage}</div>
      </div>

      <div className="tutor-scroll">
        {!session && (
          <motion.div animate={{ opacity: 1 }} initial={{ opacity: 0 }}>
            <div className="gate-card">
              <div className="gate-icon"><BrainCircuit size={20} /></div>
              <p className="gate-label">Request a change</p>
              <h3>Understand it before the agent builds it.</h3>
              <p className="gate-copy">Wormie reads a bounded set of saved project files, teaches the required concepts, then unlocks a reviewable proposal after you pass.</p>
            </div>
            <div className="agent-composer">
              <textarea
                aria-label="Describe a coding change"
                disabled={busy}
                maxLength={4000}
                onChange={(event) => setRequest(event.target.value)}
                placeholder="Add protected routes with session-based authentication..."
                value={request}
              />
              <div className="composer-meta">
                <span>{workspace ? `${documents.length} open file${documents.length === 1 ? '' : 's'} in context` : 'Open a workspace first'}</span>
                <button
                  disabled={!workspace || !request.trim() || dirtyDocuments.length > 0 || busy}
                  onClick={() => learningMutation.mutate()}
                  title={dirtyDocuments.length > 0 ? 'Save open changes before starting' : 'Start learning plan'}
                  type="button"
                >
                  {learningMutation.isPending ? <LoaderCircle className="spin" size={14} /> : <Send size={14} />}
                </button>
              </div>
              {dirtyDocuments.length > 0 && <p className="agent-warning"><AlertTriangle size={11} /> Save open changes so the agent sees the current code.</p>}
            </div>
          </motion.div>
        )}

        {session && !proposal && (
          <div className="learning-session">
            <div className="session-toolbar">
              <span>{session.concepts.length} concepts · pass at {session.passingScore}%</span>
              <button onClick={reset} type="button"><RotateCcw size={12} /> Reset</button>
            </div>
            <div className="lesson-summary">{session.lessonSummary}</div>
            <div className="concept-list">
              {session.concepts.map((concept, index) => (
                <details key={`${concept.name}-${index}`} open={index === 0}>
                  <summary><span>{index + 1}</span>{concept.name}<ChevronDown size={12} /></summary>
                  <div className="concept-body">
                    <b>Why it matters</b><p>{concept.whyItMatters}</p>
                    <b>Mental model</b><p>{concept.mentalModel}</p>
                    <b>Common mistake</b><p>{concept.commonMistake}</p>
                  </div>
                </details>
              ))}
            </div>

            <div className="quiz-heading"><ShieldCheck size={14} /><span>Learning check</span></div>
            {session.quiz.map((question, questionIndex) => {
              const feedback = quizResult?.feedback.find((item) => item.questionId === question.id)
              return (
                <fieldset className="quiz-question" key={question.id}>
                  <legend>{questionIndex + 1}. {question.prompt}</legend>
                  {question.options.map((option, optionIndex) => (
                    <label data-selected={answers[question.id] === optionIndex} key={`${question.id}:${optionIndex}`}>
                      <input
                        checked={answers[question.id] === optionIndex}
                        disabled={quizResult?.passed || quizMutation.isPending}
                        name={question.id}
                        onChange={() => {
                          setAnswers((current) => ({ ...current, [question.id]: optionIndex }))
                          if (quizResult && !quizResult.passed) setQuizResult(null)
                        }}
                        type="radio"
                      />
                      <span>{String.fromCharCode(65 + optionIndex)}</span>{option}
                    </label>
                  ))}
                  {feedback && <p className="quiz-feedback" data-correct={feedback.correct}>{feedback.correct ? 'Correct. ' : 'Review this: '}{feedback.explanation}</p>}
                </fieldset>
              )
            })}

            {!quizResult?.passed && quizAttempts < 3 ? (
              <button
                className="agent-primary"
                disabled={Object.keys(answers).length !== session.quiz.length || quizMutation.isPending}
                onClick={() => quizMutation.mutate()}
                type="button"
              >
                {quizMutation.isPending ? <LoaderCircle className="spin" size={14} /> : <LockKeyhole size={14} />}
                {quizResult ? `Try again · ${quizResult.score}%` : 'Check understanding'}
              </button>
            ) : quizResult?.passed ? (
              <div className="quiz-passed">
                <div><UnlockKeyhole size={17} /><span><b>{quizResult.score}%</b> Generation unlocked</span></div>
                <button disabled={proposalMutation.isPending} onClick={() => proposalMutation.mutate()} type="button">
                  {proposalMutation.isPending ? <LoaderCircle className="spin" size={14} /> : <FileCode2 size={14} />}
                  Generate proposal
                </button>
              </div>
            ) : (
              <button className="agent-primary" onClick={reset} type="button"><RotateCcw size={14} /> Start fresh questions</button>
            )}
          </div>
        )}

        {proposal && (
          <motion.div animate={{ opacity: 1, y: 0 }} className="proposal-view" initial={{ opacity: 0, y: 8 }}>
            <div className="session-toolbar">
              <span>Review before applying</span>
              <button onClick={reset} type="button"><RotateCcw size={12} /> New request</button>
            </div>
            <div className="proposal-summary"><Check size={16} /> <p>{proposal.summary}</p></div>
            <div className="proposal-files">
              {proposal.changes.map((change) => (
                <details key={change.relativePath}>
                  <summary><FileCode2 size={13} /><span>{change.relativePath}</span><em>{change.action}</em></summary>
                  <p>{change.explanation}</p>
                  <pre>{change.content}</pre>
                </details>
              ))}
            </div>
            {proposal.risks.length > 0 && <div className="proposal-notes"><b>Risks</b>{proposal.risks.map((risk) => <p key={risk}>{risk}</p>)}</div>}
            <div className="proposal-notes"><b>Verify</b>{proposal.verification.map((step) => <p key={step}>{step}</p>)}</div>
            <button className="agent-primary apply-button" disabled={applyMutation.isPending} onClick={() => applyMutation.mutate()} type="button">
              {applyMutation.isPending ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />}
              Apply with native confirmation
            </button>
          </motion.div>
        )}

        <AnimatePresence>
          {error && <motion.div animate={{ opacity: 1 }} className="agent-error" exit={{ opacity: 0 }} initial={{ opacity: 0 }}><AlertTriangle size={13} /><span>{error}</span></motion.div>}
        </AnimatePresence>
      </div>

      <div className="unlock-bar" data-unlocked={Boolean(quizResult?.passed)}>
        {busy ? <Square size={12} /> : quizResult?.passed ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
        <button onClick={() => busy && window.desktop.cancelAgent()} type="button">
          {busy ? 'Stop AI request' : quizResult?.passed ? 'Generation unlocked' : 'Generation locked'}
        </button>
      </div>
    </aside>
  )
}
