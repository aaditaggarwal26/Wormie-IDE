import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import {
  AlertTriangle,
  Activity,
  Check,
  ChevronDown,
  FileCode2,
  Image as ImageIcon,
  LoaderCircle,
  LockKeyhole,
  Plus,
  RotateCcw,
  Send,
  Settings2,
  ShieldCheck,
  Square,
  UnlockKeyhole,
  X
} from 'lucide-react'
import { useWorkbench } from '@/store/workbench'
import { UnderstandingQuiz } from '@/components/UnderstandingQuiz'
import { resolveSourcePath } from '@/components/understandingQuizModel'
import { AgentActivity } from '@/components/AgentActivity'
import {
  initialAgentActivityState,
  isRenderableAgentActivity,
  reduceAgentActivity,
  type AgentActivityViewState
} from '@/components/agentActivityModel'
import type {
  AgentConfig,
  AgentGuidanceSession,
  AgentMode,
  AgentModelOption,
  AgentRunResult,
  CodeProposal,
  LearningSession,
  QuizResult
} from '@shared/contracts'
import { proposalReviewProgress } from '@/components/proposalReviewModel'
import { notifyMasteryUpdated } from '@/components/useMasteryProfile'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected AI error occurred.'
}

type ImageAttachment = { path: string; name: string }

const maxAttachments = 4

export function TutorPane(): React.JSX.Element {
  const [request, setRequest] = useState('')
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [pendingRequest, setPendingRequest] = useState<string | null>(null)
  const [pendingMode, setPendingMode] = useState<AgentMode>('agent')
  const [mode, setMode] = useState<AgentMode>('agent')
  const [session, setSession] = useState<LearningSession | null>(null)
  const [guidance, setGuidance] = useState<AgentGuidanceSession | null>(null)
  const [answers, setAnswers] = useState<Record<string, number>>({})
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null)
  const [quizAttempts, setQuizAttempts] = useState(0)
  const [proposal, setProposal] = useState<CodeProposal | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activityOpen, setActivityOpen] = useState(false)
  const [activityState, setActivityState] = useState<AgentActivityViewState | null>(null)
  const [agentConfig, setAgentConfig] = useState<AgentConfig | null>(null)
  const [modelOptions, setModelOptions] = useState<AgentModelOption[]>([])
  const [modelSaving, setModelSaving] = useState(false)
  const activeRunId = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const attachmentInputRef = useRef<HTMLInputElement | null>(null)
  const workspace = useWorkbench((state) => state.workspace)
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const setWorkspace = useWorkbench((state) => state.setWorkspace)
  const setActivity = useWorkbench((state) => state.setActivity)
  const openDocument = useWorkbench((state) => state.openDocument)
  const addOutput = useWorkbench((state) => state.addOutput)
  const proposalReview = useWorkbench((state) => state.proposalReview)
  const beginProposalReview = useWorkbench((state) => state.beginProposalReview)
  const openProposalFile = useWorkbench((state) => state.openProposalFile)
  const discardProposalReview = useWorkbench((state) => state.discardProposalReview)
  const completeProposalReview = useWorkbench((state) => state.completeProposalReview)
  const replaceDocumentFromDisk = useWorkbench((state) => state.replaceDocumentFromDisk)
  const dirtyDocuments = useMemo(
    () => documents.filter((document) => document.content !== document.savedContent),
    [documents]
  )
  const availableModels = useMemo(() => {
    const options = [...modelOptions]
    if (agentConfig && !options.some((option) => option.id === agentConfig.model)) {
      options.unshift({
        id: agentConfig.model,
        displayName: agentConfig.model || 'Provider default',
        description: agentConfig.model ? 'Currently selected model' : 'Let the provider choose the model'
      })
    }
    return options
  }, [agentConfig, modelOptions])

  useEffect(() => window.desktop.onAgentActivity((event) => {
    if (!isRenderableAgentActivity(event) || event.runId !== activeRunId.current) return
    setActivityState((current) => reduceAgentActivity(current ?? initialAgentActivityState(event.runId), event))
    if (event.state === 'failed' || event.state === 'stopped') setActivityOpen(true)
  }), [])

  const reportError = (cause: unknown) => {
    setError(errorMessage(cause))
    setActivityOpen(true)
  }

  useEffect(() => {
    let active = true
    void window.desktop.getAgentConfig()
      .then((config) => {
        if (!active) return
        setAgentConfig(config)
        void window.desktop.listAgentModels()
          .then((options) => {
            if (active) setModelOptions(options)
          })
          .catch(() => undefined)
      })
      .catch((cause) => {
        if (active) setError(errorMessage(cause))
      })
    return () => { active = false }
  }, [])

  const learningMutation = useMutation<AgentRunResult, Error, { runId: string; intent: string; mode: AgentMode; imagePaths: string[] }>({
    mutationFn: ({ runId, intent, mode: requestMode, imagePaths }) => window.desktop.startLearning({
      runId,
      request: intent,
      mode: requestMode,
      activePath,
      openPaths: documents.map((document) => document.path),
      imagePaths
    }),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      if (result.mode === 'agent') {
        setSession(result)
        setGuidance(null)
      } else {
        setGuidance(result)
        setSession(null)
      }
      setAnswers({})
      setQuizResult(null)
      setQuizAttempts(0)
      setProposal(null)
      setAttachments([])
    },
    onError: (cause, variables) => {
      setRequest((current) => current || variables.intent)
      reportError(cause)
    },
    onSettled: () => setPendingRequest(null)
  })

  const quizMutation = useMutation({
    mutationFn: () => window.desktop.submitQuiz({ sessionId: session!.id, answers }),
    onMutate: () => setError(null),
    onSuccess: (result) => {
      setQuizResult(result)
      setQuizAttempts((attempts) => attempts + 1)
      notifyMasteryUpdated()
    },
    onError: reportError
  })

  const proposalMutation = useMutation({
    mutationFn: () => window.desktop.generateProposal(session!.id),
    onMutate: () => setError(null),
    onSuccess: (nextProposal) => {
      setProposal(nextProposal)
      const currentWorkspace = useWorkbench.getState().workspace
      if (currentWorkspace) beginProposalReview(nextProposal, currentWorkspace.rootPath, window.desktop.platform)
    },
    onError: reportError
  })

  const applyMutation = useMutation({
    mutationFn: () => window.desktop.applyProposal({
      proposalId: proposal!.id,
      files: proposalReview!.files.map((file) => ({
        relativePath: file.relativePath,
        content: file.modifiedContent,
        keptBlocks: file.keptBlocks,
        undoneBlocks: file.undoneBlocks
      }))
    }),
    onMutate: () => setError(null),
    onSuccess: async (result) => {
      if (!result.applied) return
      setWorkspace(result.workspace)
      completeProposalReview(result.changedPaths)
      const refreshedFiles = await Promise.all(result.changedPaths.map((filePath) => window.desktop.readFile(filePath).catch(() => null)))
      for (const file of refreshedFiles) if (file) replaceDocumentFromDisk(file)
      addOutput(`Applied AI proposal to ${result.changedPaths.length} file${result.changedPaths.length === 1 ? '' : 's'}.`)
      setProposal(null)
      setSession(null)
      setAnswers({})
      setQuizResult(null)
    },
    onError: reportError
  })

  const busy = learningMutation.isPending || quizMutation.isPending || proposalMutation.isPending || applyMutation.isPending

  // Keep the conversation area anchored to what changed: new content scrolls to
  // the top of the lesson/proposal, activity and errors scroll into view below.
  useEffect(() => {
    const node = scrollRef.current
    if (!node) return
    if (learningMutation.isPending || error) node.scrollTop = node.scrollHeight
    else node.scrollTop = 0
  }, [session?.id, guidance?.id, proposal?.id, error, learningMutation.isPending])
  const proposalUnlocked = !proposal?.understanding?.significance.quizRequired || proposal.understanding.gate?.unlocked === true
  const reviewProgress = proposalReview ? proposalReviewProgress(proposalReview.files) : null
  const reviewHasDirtyConflict = proposalReview?.files.some((file) => {
    const document = documents.find((candidate) => candidate.path === file.absolutePath)
    return document ? document.content !== document.savedContent : false
  }) ?? false

  const startLearning = () => {
    const intent = request.trim()
    if (!workspace || !intent || dirtyDocuments.length > 0 || busy) return
    const runId = crypto.randomUUID()
    activeRunId.current = runId
    setActivityState(initialAgentActivityState(runId))
    setActivityOpen(true)
    setRequest('')
    setGuidance(null)
    setPendingRequest(intent)
    setPendingMode(mode)
    learningMutation.mutate({ runId, intent, mode, imagePaths: attachments.map((attachment) => attachment.path) })
  }

  const selectModel = (nextModel: string) => {
    if (!agentConfig || modelSaving || nextModel === agentConfig.model) return
    const previous = agentConfig
    setAgentConfig({ ...agentConfig, model: nextModel })
    setModelSaving(true)
    void window.desktop.saveAgentConfig({
      provider: agentConfig.provider,
      model: nextModel,
      baseUrl: agentConfig.baseUrl
    }).then(setAgentConfig).catch((cause) => {
      setAgentConfig(previous)
      reportError(cause)
    }).finally(() => setModelSaving(false))
  }

  const addDroppedFiles = (files: File[]) => {
    setAttachments((current) => {
      const next = [...current]
      for (const file of files) {
        if (next.length >= maxAttachments) break
        if (!file.type.startsWith('image/')) continue
        try {
          const filePath = window.desktop.pathForFile(file)
          if (filePath && !next.some((attachment) => attachment.path === filePath)) {
            next.push({ path: filePath, name: file.name || 'screenshot' })
          }
        } catch {
          // Files without a filesystem path (e.g. dragged from a browser) are skipped.
        }
      }
      return next
    })
  }

  const composerVisible = !session
  const handleDragOver = (event: React.DragEvent) => {
    if (!composerVisible || busy || !event.dataTransfer.types.includes('Files')) return
    event.preventDefault()
    setDragActive(true)
  }
  const handleDrop = (event: React.DragEvent) => {
    setDragActive(false)
    if (!composerVisible || busy || event.dataTransfer.files.length === 0) return
    event.preventDefault()
    addDroppedFiles(Array.from(event.dataTransfer.files))
  }

  const openProposedFile = (relativePath: string) => {
    openProposalFile(relativePath)
  }

  const openAppliedFile = (absolutePath: string) => {
    void window.desktop.readFile(absolutePath)
      .then((file) => openDocument(file))
      .catch(reportError)
  }

  const reset = () => {
    if (busy) window.desktop.cancelAgent()
    if (proposal) void window.desktop.rejectProposal(proposal.id).catch((cause) => addOutput(`Could not record proposal rejection: ${errorMessage(cause)}`))
    discardProposalReview()
    setSession(null)
    setGuidance(null)
    setAnswers({})
    setQuizResult(null)
    setQuizAttempts(0)
    setProposal(null)
    setError(null)
    setAttachments([])
    setPendingRequest(null)
    setPendingMode('agent')
    setActivityState(null)
    activeRunId.current = null
    setActivityOpen(false)
  }

  return (
    <aside
      className="tutor-pane"
      data-drag-active={dragActive}
      data-workbench-focus="tutor"
      onDragLeave={() => setDragActive(false)}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      tabIndex={-1}
    >
      <div className="tutor-heading">
        <h2>Chat</h2>
        <div className="tutor-heading-actions">
          <button
            aria-label="Activity"
            aria-controls="agent-activity"
            aria-expanded={activityOpen}
            className="activity-toggle"
            data-active={activityOpen}
            onClick={() => setActivityOpen((open) => !open)}
            title="Activity"
            type="button"
          >
            <Activity size={14} />
          </button>
        </div>
      </div>

      {activityOpen && (
        <div className="agent-activity-shell">
          <AgentActivity
            canOpenProposed={Boolean(proposal)}
            onOpenAppliedFile={openAppliedFile}
            onOpenProposedFile={openProposedFile}
            state={activityState}
          />
        </div>
      )}

      <div className="tutor-scroll" ref={scrollRef}>
        {!session && !guidance && !pendingRequest && (
          <div className="agent-empty">
            <h3>Ask Wormie Agent for help</h3>
            <p>Wormie explains concepts, checks your understanding, then proposes changes for you to review. Drop screenshots onto this panel to attach them.</p>
          </div>
        )}

        {!session && pendingRequest && (
          <div className="chat-exchange">
            <div className="chat-user-message">{pendingRequest}</div>
            <div className="chat-working">
              <LoaderCircle className="spin" size={13} />
              <span>{pendingMode === 'plan'
                ? 'Wormie is researching an implementation plan…'
                : pendingMode === 'ask'
                  ? 'Wormie is researching your question…'
                  : 'Wormie is preparing your lesson…'}</span>
            </div>
          </div>
        )}

        {guidance && !pendingRequest && (
          <div className="guidance-session">
            <div className="chat-user-message">{guidance.request}</div>
            <div className="session-toolbar">
              <span>{guidance.mode === 'plan' ? 'Plan mode · no edits' : 'Ask mode · no edits'}</span>
              <button onClick={reset} type="button"><RotateCcw size={12} /> Clear</button>
            </div>
            <div className="lesson-summary">{guidance.summary}</div>
            <div className="guidance-sections">
              {guidance.sections.map((section, index) => (
                <section key={`${section.title}-${index}`}>
                  <h4>{section.title}</h4>
                  <p>{section.content}</p>
                </section>
              ))}
            </div>
            {guidance.nextSteps.length > 0 && (
              <div className="guidance-next-steps">
                <b>Next steps</b>
                <ol>{guidance.nextSteps.map((step, index) => <li key={`${step}-${index}`}>{step}</li>)}</ol>
              </div>
            )}
          </div>
        )}

        {session && !proposal && (
          <div className="learning-session">
            <div className="chat-user-message">{session.request}</div>
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
                  <legend className="sr-only">Question {questionIndex + 1}: {question.prompt}</legend>
                  <div className="quiz-question-prompt" aria-hidden="true">
                    <span>{questionIndex + 1}</span>
                    <p>{question.prompt}</p>
                  </div>
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
          <div className="proposal-view">
            <div className="session-toolbar">
              <span>Review before applying</span>
              <button onClick={reset} type="button"><RotateCcw size={12} /> New request</button>
            </div>
            <div className="proposal-summary"><Check size={16} /> <p>{proposal.summary}</p></div>
            <div className="proposal-files">
              {proposal.changes.map((change) => {
                const review = proposalReview?.files.find((file) => file.relativePath === change.relativePath)
                const status = review?.pendingBlocks === 0
                  ? `${review.keptBlocks} kept · ${review.undoneBlocks} undone`
                  : review?.pendingBlocks == null
                    ? 'Open to review'
                    : `${review.pendingBlocks} block${review.pendingBlocks === 1 ? '' : 's'} left`
                return (
                  <button
                    data-state={review?.pendingBlocks === 0 ? 'reviewed' : 'pending'}
                    key={change.relativePath}
                    onClick={() => openProposedFile(change.relativePath)}
                    type="button"
                  >
                    <FileCode2 size={13} />
                    <span><b>{change.relativePath}</b><small>{change.explanation}</small></span>
                    <em>{status}</em>
                  </button>
                )
              })}
            </div>
            {reviewProgress && (
              <div className="proposal-review-progress" data-complete={reviewProgress.complete}>
                <span><b>{reviewProgress.reviewedFiles}/{reviewProgress.totalFiles}</b> files reviewed</span>
                <span>{reviewProgress.keptBlocks} kept · {reviewProgress.undoneBlocks} undone</span>
              </div>
            )}
            {reviewHasDirtyConflict && <p className="agent-warning proposal-warning"><AlertTriangle size={11} /> This proposal conflicts with unsaved edits. Discard it, save your work, then generate a fresh proposal.</p>}
            {proposal.understanding && <UnderstandingQuiz
              preparation={proposal.understanding}
              onGateChange={(gate) => setProposal((current) => current?.understanding ? { ...current, understanding: { ...current.understanding, gate, generationError: undefined } } : current)}
              onOpenSource={(relativePath, line) => {
                if (!workspace) return
                const absolutePath = resolveSourcePath(workspace.rootPath, relativePath, window.desktop.platform)
                void window.desktop.readFile(absolutePath).then((file) => openDocument(file, line)).catch((cause) => setError(errorMessage(cause)))
              }}
              onRetry={async () => {
                const prepared = await window.desktop.prepareProposalQuiz(proposal.id)
                setProposal((current) => current ? { ...current, understanding: prepared } : current)
                return prepared
              }}
            />}
            {proposal.risks.length > 0 && <div className="proposal-notes"><b>Risks</b>{proposal.risks.map((risk) => <p key={risk}>{risk}</p>)}</div>}
            <div className="proposal-notes"><b>Verify</b>{proposal.verification.map((step) => <p key={step}>{step}</p>)}</div>
            <button
              className="agent-primary apply-button"
              disabled={applyMutation.isPending || !proposalUnlocked || !reviewProgress?.complete || !reviewProgress.hasKeptChanges || reviewHasDirtyConflict}
              onClick={() => applyMutation.mutate()}
              type="button"
            >
              {applyMutation.isPending ? <LoaderCircle className="spin" size={14} /> : <ShieldCheck size={14} />}
              {!reviewProgress?.complete
                ? 'Review every change block in the editor'
                : !reviewProgress.hasKeptChanges
                  ? 'No changes kept · discard proposal'
                  : proposalUnlocked
                    ? 'Apply reviewed changes'
                    : 'Pass understanding check to apply'}
            </button>
          </div>
        )}

        {error && <div className="agent-error"><AlertTriangle size={13} /><span>{error}</span></div>}
      </div>

      {!session && (
        <div className="agent-composer-shell">
          <div className="agent-composer" data-drag-active={dragActive}>
            {attachments.length > 0 && (
              <div className="composer-attachments">
                {attachments.map((attachment) => (
                  <span className="composer-attachment" key={attachment.path}>
                    <ImageIcon size={11} />
                    <em>{attachment.name}</em>
                    <button
                      aria-label={`Remove ${attachment.name}`}
                      disabled={busy}
                      onClick={() => setAttachments((current) => current.filter((item) => item.path !== attachment.path))}
                      type="button"
                    ><X size={11} /></button>
                  </span>
                ))}
              </div>
            )}
            <textarea
              aria-label="Describe a coding change"
              disabled={busy}
              maxLength={4000}
              onChange={(event) => setRequest(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return
                event.preventDefault()
                startLearning()
              }}
              placeholder={mode === 'plan' ? 'Describe what to plan' : mode === 'ask' ? 'Ask about your code' : 'Describe what to build'}
              rows={1}
              value={request}
            />
            <div className="composer-meta">
              <input
                accept="image/png,image/jpeg,image/gif,image/webp"
                aria-label="Attach screenshots"
                hidden
                multiple
                onChange={(event) => {
                  addDroppedFiles(Array.from(event.currentTarget.files ?? []))
                  event.currentTarget.value = ''
                }}
                ref={attachmentInputRef}
                type="file"
              />
              <button
                aria-label="Attach screenshots"
                className="composer-tool"
                disabled={busy || attachments.length >= maxAttachments}
                onClick={() => attachmentInputRef.current?.click()}
                title="Attach screenshots"
                type="button"
              ><Plus size={15} /></button>
              <select
                aria-label="Agent mode"
                className="composer-select composer-mode-select"
                disabled={busy}
                onChange={(event) => setMode(event.target.value as AgentMode)}
                title="Choose how Wormie responds"
                value={mode}
              >
                <option value="agent">Agent</option>
                <option value="plan">Plan</option>
                <option value="ask">Ask</option>
              </select>
              <select
                aria-label="AI model"
                className="composer-select composer-model-select"
                disabled={busy || modelSaving || !agentConfig}
                onChange={(event) => selectModel(event.target.value)}
                title={agentConfig ? `${agentConfig.provider} model` : 'Loading model'}
                value={agentConfig?.model ?? ''}
              >
                {!agentConfig && <option value="">Loading model…</option>}
                {availableModels.map((option) => (
                  <option key={option.id || 'provider-default'} title={option.description} value={option.id}>{option.displayName}</option>
                ))}
              </select>
              <button
                aria-label="Agent settings"
                className="composer-tool"
                disabled={busy}
                onClick={() => setActivity('settings')}
                title="Agent settings"
                type="button"
              ><Settings2 size={14} /></button>
              {busy ? (
                <button
                  aria-label="Stop the AI request"
                  className="composer-submit composer-stop"
                  onClick={() => window.desktop.cancelAgent()}
                  title="Stop"
                  type="button"
                >
                  <Square size={12} />
                </button>
              ) : (
                <button
                  className="composer-submit"
                  disabled={!workspace || !request.trim() || dirtyDocuments.length > 0}
                  onClick={startLearning}
                  title={dirtyDocuments.length > 0 ? 'Save open changes before starting' : 'Send'}
                  type="button"
                >
                  <Send size={14} />
                </button>
              )}
            </div>
            {dirtyDocuments.length > 0 && <p className="agent-warning"><AlertTriangle size={11} /> Save open changes first.</p>}
          </div>
        </div>
      )}

      <div className="unlock-bar" data-unlocked={Boolean(guidance || quizResult?.passed)}>
        {busy ? <Square size={12} /> : guidance ? <ShieldCheck size={14} /> : quizResult?.passed ? <UnlockKeyhole size={14} /> : <LockKeyhole size={14} />}
        <button onClick={() => busy && window.desktop.cancelAgent()} type="button">
          {busy ? 'Stop' : guidance ? `${guidance.mode === 'plan' ? 'Plan' : 'Ask'} · read only` : quizResult?.passed ? 'Unlocked' : 'Locked'}
        </button>
      </div>
    </aside>
  )
}
