import path from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { IPC_CHANNELS, type ChangeInput, type GitStatusSnapshot, type StagedChangeAnalysis } from '../shared/contracts'
import { findGitRepositories } from './gitDiscovery'
import type { UnderstandingController } from './understanding'
import { buildStagedChangeInput, validateCommitMessage } from './gitChange'

export function registerGitHandlers(getWorkspaceRoot: () => string | null, understanding: UnderstandingController): void {
  async function validatedRepository(repositoryRoot: string) {
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('Open a workspace first.')
    if (typeof repositoryRoot !== 'string' || repositoryRoot.length > 2_000) throw new Error('Choose a valid repository.')
    const repositories = await findGitRepositories(workspaceRoot)
    const resolved = path.resolve(repositoryRoot)
    const selected = repositories.find((candidate) => path.resolve(candidate) === resolved)
    if (!selected) throw new Error('The selected repository is not part of this workspace.')
    return { root: selected, git: simpleGit({ baseDir: selected, maxConcurrentProcesses: 1 }) }
  }

  async function readStagedChange(repositoryRoot: string): Promise<ChangeInput> {
    const { root, git } = await validatedRepository(repositoryRoot)
    const [numstat, nameStatus, patchText] = await Promise.all([
      git.raw(['diff', '--cached', '--numstat']),
      git.raw(['diff', '--cached', '--name-status']),
      git.raw(['diff', '--cached', '--no-ext-diff', '--unified=3'])
    ])
    const change = buildStagedChangeInput(root, numstat, nameStatus, patchText)
    if (change.files.length === 0) throw new Error('Stage at least one change before committing.')
    return change
  }

  ipcMain.handle(IPC_CHANNELS.gitStatus, async (): Promise<GitStatusSnapshot> => {
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('Open a workspace first.')

    const repositoryRoots = await findGitRepositories(workspaceRoot)
    const repositories: GitStatusSnapshot['repositories'] = []

    for (const repositoryRoot of repositoryRoots) {
      const git = simpleGit({ baseDir: repositoryRoot, maxConcurrentProcesses: 1 })
      if (!(await git.checkIsRepo())) continue

      const status = await git.status()
      repositories.push({
        rootPath: repositoryRoot,
        name: path.basename(repositoryRoot),
        relativePath: path.relative(workspaceRoot, repositoryRoot) || '.',
        branch: status.current,
        ahead: status.ahead,
        behind: status.behind,
        files: status.files.map((file) => ({
          path: file.path,
          absolutePath: path.join(repositoryRoot, file.path),
          index: file.index,
          workingTree: file.working_dir
        }))
      })
    }

    return { workspaceRoot, repositories }
  })

  ipcMain.handle(IPC_CHANNELS.gitAnalyzeStaged, async (_event, repositoryRoot: string, forceNew = false): Promise<StagedChangeAnalysis> => {
    const change = await readStagedChange(repositoryRoot)
    try {
      const prepared = await understanding.prepare(change, Boolean(forceNew))
      return { repositoryRoot, stagedFiles: change.files.map((file) => file.path), ...prepared }
    } catch (error) {
      const analysis = understanding.analyze(change)
      return {
        repositoryRoot,
        stagedFiles: change.files.map((file) => file.path),
        changeId: change.id,
        ...analysis,
        gate: null,
        generationError: error instanceof Error ? error.message.slice(0, 500) : 'Understanding check generation failed.'
      }
    }
  })

  ipcMain.handle(IPC_CHANNELS.gitCommitStaged, async (_event, request: { repositoryRoot: string; message: string }) => {
    const message = validateCommitMessage(request?.message)
    const change = await readStagedChange(request?.repositoryRoot)
    const analysis = understanding.analyze(change)
    if (analysis.significance.quizRequired) understanding.gates.assertUnlocked(change.id, change.source, analysis.fingerprint)
    const { git } = await validatedRepository(request.repositoryRoot)
    const result = await git.commit(message)
    if (!result.commit) throw new Error('Git did not create a commit.')
    return {
      commit: result.commit,
      summary: `${result.summary.changes} files changed, ${result.summary.insertions} insertions, ${result.summary.deletions} deletions`
    }
  })
}
