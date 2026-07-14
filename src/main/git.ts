import path from 'node:path'
import { ipcMain } from 'electron'
import { simpleGit } from 'simple-git'
import { IPC_CHANNELS, type GitStatusSnapshot } from '../shared/contracts'

export function registerGitHandlers(getWorkspaceRoot: () => string | null): void {
  ipcMain.handle(IPC_CHANNELS.gitStatus, async (): Promise<GitStatusSnapshot> => {
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('Open a workspace first.')

    const git = simpleGit({ baseDir: workspaceRoot, maxConcurrentProcesses: 1 })
    if (!(await git.checkIsRepo())) {
      return { isRepository: false, branch: null, ahead: 0, behind: 0, files: [] }
    }

    const status = await git.status()
    return {
      isRepository: true,
      branch: status.current,
      ahead: status.ahead,
      behind: status.behind,
      files: status.files.map((file) => ({
        path: file.path,
        absolutePath: path.join(workspaceRoot, file.path),
        index: file.index,
        workingTree: file.working_dir
      }))
    }
  })
}

