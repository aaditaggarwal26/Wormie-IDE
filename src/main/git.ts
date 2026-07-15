import path from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { IPC_CHANNELS, type GitStatusSnapshot } from '../shared/contracts'
import { findGitRepositories } from './gitDiscovery'

export function registerGitHandlers(getWorkspaceRoot: () => string | null): void {
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
}
