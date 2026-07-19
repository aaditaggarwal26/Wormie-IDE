import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { FolderGit2, GitBranch, LoaderCircle, RefreshCw, ScanSearch, ShieldAlert, ShieldCheck } from 'lucide-react'
import { UnderstandingQuiz } from '@/components/UnderstandingQuiz'
import { resolveSourcePath } from '@/components/understandingQuizModel'
import { useWorkbench } from '@/store/workbench'
import type { GitStatusSnapshot, StagedChangeAnalysis, WorkspaceSnapshot } from '@shared/contracts'

type SourceControlPanelProps = {
  workspace: WorkspaceSnapshot | null
  status: GitStatusSnapshot | null
  busy: boolean
  error: string | null
  onRefresh: () => void
  onOpenFile: (filePath: string) => void
  onTrustRepository: (repositoryRoot: string) => void
  trustingRoot: string | null
}

export function SourceControlPanel({
  workspace,
  status,
  busy,
  error,
  onRefresh,
  onOpenFile,
  onTrustRepository,
  trustingRoot
}: SourceControlPanelProps): React.JSX.Element {
  const [selectedRoot, setSelectedRoot] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [analysis, setAnalysis] = useState<StagedChangeAnalysis | null>(null)
  const addOutput = useWorkbench((state) => state.addOutput)
  const repositories = status?.repositories ?? []
  const problems = status?.problems ?? []
  const selectedRepository = repositories.find((repository) => repository.rootPath === selectedRoot) ?? repositories[0]

  useEffect(() => {
    if (!repositories.some((repository) => repository.rootPath === selectedRoot)) {
      setSelectedRoot(repositories[0]?.rootPath ?? null)
    }
  }, [status, selectedRoot])

  useEffect(() => { setAnalysis(null) }, [selectedRepository?.rootPath, selectedRepository?.files.map((file) => `${file.path}:${file.index}`).join('|')])

  const analyzeMutation = useMutation<StagedChangeAnalysis, Error, boolean>({
    mutationFn: (forceNew = false) => window.desktop.analyzeStagedChange(selectedRepository!.rootPath, forceNew),
    onSuccess: setAnalysis,
    onError: (cause) => addOutput(`Could not analyze staged changes: ${cause instanceof Error ? cause.message : 'Unknown error'}`)
  })

  const commitMutation = useMutation({
    mutationFn: () => window.desktop.commitStagedChange({ repositoryRoot: selectedRepository!.rootPath, message }),
    onSuccess: (result) => {
      addOutput(`Created commit ${result.commit.slice(0, 8)} · ${result.summary}.`)
      setMessage(''); setAnalysis(null); onRefresh()
    },
    onError: (cause) => addOutput(`Could not create commit: ${cause instanceof Error ? cause.message : 'Unknown error'}`)
  })

  const stagedCount = selectedRepository?.files.filter((file) => file.index.trim()).length ?? 0
  const commitUnlocked = Boolean(analysis) && (!analysis!.significance.quizRequired || analysis!.gate?.unlocked)

  return (
    <aside className="side-panel source-panel">
      <div className="panel-heading">
        <span>Source Control</span>
        <button disabled={!workspace || busy} onClick={onRefresh} title="Detect repositories again" type="button">
          <RefreshCw className={busy ? 'spin' : ''} size={14} />
        </button>
      </div>

      {!workspace && <div className="panel-message">Open a workspace to detect Git repositories.</div>}
      {workspace && busy && !status && !error && <div className="panel-message">Detecting repositories...</div>}
      {workspace && error && (
        <div className="git-problem-card" role="alert">
          <ShieldAlert size={18} />
          <div><strong>Git status unavailable</strong><p>{error}</p></div>
          <button disabled={busy} onClick={onRefresh} type="button"><RefreshCw className={busy ? 'spin' : ''} size={12} /> Try again</button>
        </div>
      )}
      {problems.map((problem) => {
        const trusting = trustingRoot === problem.rootPath
        return (
          <div className="git-problem-card" data-kind={problem.kind} key={problem.rootPath} role="alert">
            <ShieldAlert size={18} />
            <div>
              <strong>{problem.kind === 'unsafe-ownership' ? 'Repository trust required' : 'Repository unavailable'}</strong>
              <p>{problem.message}</p>
              <code>{problem.relativePath === '.' ? problem.name : problem.relativePath}</code>
            </div>
            {problem.kind === 'unsafe-ownership'
              ? <button disabled={busy} onClick={() => onTrustRepository(problem.rootPath)} type="button">{trusting ? <LoaderCircle className="spin" size={12} /> : <ShieldCheck size={12} />} {trusting ? 'Trusting...' : 'Trust and retry'}</button>
              : <button disabled={busy} onClick={onRefresh} type="button"><RefreshCw className={busy ? 'spin' : ''} size={12} /> Try again</button>}
          </div>
        )
      })}
      {status && repositories.length === 0 && problems.length === 0 && (
        <div className="repository-empty">
          <FolderGit2 size={22} />
          <strong>No Git repositories found</strong>
          <span>Checked the workspace and nested folders up to five levels deep.</span>
        </div>
      )}

      {repositories.length > 0 && (
        <>
          <div className="repositories-heading"><span>Repositories</span><b>{repositories.length}</b></div>
          <div className="repository-list">
            {repositories.map((repository) => (
              <button
                data-active={selectedRepository?.rootPath === repository.rootPath}
                key={repository.rootPath}
                onClick={() => setSelectedRoot(repository.rootPath)}
                type="button"
              >
                <FolderGit2 size={13} />
                <span>{repository.relativePath === '.' ? repository.name : repository.relativePath}</span>
                <code>{repository.files.length}</code>
              </button>
            ))}
          </div>
        </>
      )}

      {selectedRepository && (
        <>
          <div className="branch-summary">
            <GitBranch size={14} />
            <strong>{selectedRepository.branch ?? 'Detached HEAD'}</strong>
            {(selectedRepository.ahead > 0 || selectedRepository.behind > 0) && (
              <span>{selectedRepository.ahead} up / {selectedRepository.behind} down</span>
            )}
          </div>
          <div className="changes-heading"><span>Changes</span><b>{selectedRepository.files.length}</b></div>
          <div className="change-list">
            {selectedRepository.files.length === 0 && <div className="panel-message compact">Working tree clean.</div>}
            {selectedRepository.files.map((file) => (
              <button className="change-row" key={file.path} onClick={() => onOpenFile(file.absolutePath)} type="button">
                <span>{file.path}</span>
                <code>{file.index.trim() || file.workingTree.trim() || 'M'}</code>
              </button>
            ))}
          </div>
          <div className="commit-workflow">
            <label htmlFor="commit-message">Commit message</label>
            <textarea id="commit-message" maxLength={2000} onChange={(event) => setMessage(event.target.value)} placeholder="Describe the staged change…" value={message} />
            {!analysis && <button className="commit-primary" disabled={stagedCount === 0 || analyzeMutation.isPending} onClick={() => analyzeMutation.mutate(false)} type="button">
              {analyzeMutation.isPending ? <LoaderCircle className="spin" size={12} /> : <ScanSearch size={12} />} Analyze {stagedCount} staged file{stagedCount === 1 ? '' : 's'}
            </button>}
            {analysis && <UnderstandingQuiz
              preparation={analysis}
              onGateChange={(gate) => setAnalysis((current) => current ? { ...current, gate, generationError: undefined } : current)}
              onOpenSource={(relativePath) => {
                onOpenFile(resolveSourcePath(selectedRepository.rootPath, relativePath, window.desktop.platform))
              }}
              onRetry={async () => {
                const next = await window.desktop.analyzeStagedChange(selectedRepository.rootPath, true)
                setAnalysis(next)
                return next
              }}
            />}
            {analysis && <button className="commit-primary" disabled={!message.trim() || !commitUnlocked || commitMutation.isPending} onClick={() => commitMutation.mutate()} type="button">
              {commitMutation.isPending ? <LoaderCircle className="spin" size={12} /> : <GitBranch size={12} />}{commitUnlocked ? 'Create commit' : 'Pass check to commit'}
            </button>}
          </div>
        </>
      )}
    </aside>
  )
}

