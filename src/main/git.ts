import path from 'node:path'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { simpleGit } from 'simple-git'
import { IPC_CHANNELS, type ChangeInput, type GitStatusSnapshot, type StagedChangeAnalysis } from '../shared/contracts'
import { findGitRepositories } from './gitDiscovery'
import type { UnderstandingController } from './understanding'
import { buildStagedChangeInput, validateCommitMessage } from './gitChange'

export function registerGitHandlers(
  getWorkspaceRoot: () => string | null,
  understanding: UnderstandingController,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  const assertTrusted = (event: IpcMainInvokeEvent) => {
    if (!isTrustedSender(event)) throw new Error('Untrusted Git request.')
  }

  async function validatedRepositoryRoot(repositoryRoot: string): Promise<string> {
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('Open a workspace first.')
    if (typeof repositoryRoot !== 'string' || repositoryRoot.length > 2_000) throw new Error('Choose a valid repository.')
    const repositories = await findGitRepositories(workspaceRoot)
    const resolved = path.resolve(repositoryRoot)
    const selected = repositories.find((candidate) => path.resolve(candidate) === resolved)
    if (!selected) throw new Error('The selected repository is not part of this workspace.')
    return selected
  }

  async function validatedRepository(repositoryRoot: string) {
    const root = await validatedRepositoryRoot(repositoryRoot)
    return { root, git: simpleGit({ baseDir: root, maxConcurrentProcesses: 1 }) }
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

  const readStatus = async (): Promise<GitStatusSnapshot> => {
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('Open a workspace first.')

    const repositoryRoots = await findGitRepositories(workspaceRoot)
    const repositories: GitStatusSnapshot['repositories'] = []
    const problems: GitStatusSnapshot['problems'] = []

    for (const repositoryRoot of repositoryRoots) {
      const git = simpleGit({ baseDir: repositoryRoot, maxConcurrentProcesses: 1 })
      try {
        if (!(await git.checkIsRepo())) {
          problems.push({
            rootPath: repositoryRoot,
            name: path.basename(repositoryRoot),
            relativePath: path.relative(workspaceRoot, repositoryRoot) || '.',
            kind: 'unavailable',
            message: 'Git metadata exists here, but Git could not open it as a repository.'
          })
          continue
        }

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
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unknown Git error.'
        const unsafeOwnership = /detected dubious ownership/i.test(detail)
        problems.push({
          rootPath: repositoryRoot,
          name: path.basename(repositoryRoot),
          relativePath: path.relative(workspaceRoot, repositoryRoot) || '.',
          kind: unsafeOwnership ? 'unsafe-ownership' : 'unavailable',
          message: unsafeOwnership
            ? 'Git does not trust this folder because Windows reports it as owned by another account.'
            : `Git could not read this repository: ${detail.replace(/^fatal:\s*/i, '').slice(0, 300)}`
        })
      }
    }

    return { workspaceRoot, repositories, problems }
  }

  ipcMain.handle(IPC_CHANNELS.gitStatus, async (event): Promise<GitStatusSnapshot> => {
    assertTrusted(event)
    return readStatus()
  })

  ipcMain.handle(IPC_CHANNELS.gitTrustRepository, async (event, repositoryRoot: string): Promise<void> => {
    assertTrusted(event)
    const root = await validatedRepositoryRoot(repositoryRoot)
    const safePath = process.platform === 'win32' ? root.replaceAll('\\', '/') : root
    await simpleGit().raw(['config', '--global', '--add', 'safe.directory', safePath])
  })

  ipcMain.handle(IPC_CHANNELS.gitAnalyzeStaged, async (event, repositoryRoot: string, forceNew = false): Promise<StagedChangeAnalysis> => {
    assertTrusted(event)
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

  ipcMain.handle(IPC_CHANNELS.gitCommitStaged, async (event, request: { repositoryRoot: string; message: string }) => {
    assertTrusted(event)
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
