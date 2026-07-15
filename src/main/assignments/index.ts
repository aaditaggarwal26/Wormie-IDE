import { promises as fs } from 'node:fs'
import path from 'node:path'
import { dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import type Store from 'electron-store'
import {
  IPC_CHANNELS,
  type AssignmentExportResult,
  type AssignmentImportResult,
  type AssignmentSaveRequest,
  type AssignmentStartRequest,
  type AssignmentSubmitRequest,
  type AssignmentSubmission,
  type AssignmentSubmissionExportResult,
  type AssignmentTaskProgressRequest,
  type AssignmentWorkspaceState
} from '../../shared/contracts'
import type { AppPreferences } from '../preferences'
import { isPathInside } from '../pathSafety'
import { createAssignmentPackage, importAssignmentPackage } from './package'
import { readAiActivity } from './activity'
import { commitSubmittedProgress, prepareSubmittedProgress, readProgress, startProgress, updateTaskProgress } from './progress'
import { getAssignmentManifestPath, readAssignment, readAssignmentRevision, saveAssignment } from './storage'
import { createAssignmentSubmission, readAssignmentSubmission } from './submission'

const maxAssignmentIpcBytes = 256 * 1024

export function registerAssignmentHandlers(
  store: Store<AppPreferences>,
  progressStorageRoot: string,
  getWorkspaceRoot: () => string | null,
  setWorkspace: (rootPath: string) => Promise<import('../../shared/contracts').WorkspaceSnapshot>,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  function workspaceKey(rootPath: string): string {
    const resolved = path.resolve(rootPath)
    return process.platform === 'win32' ? resolved.toLowerCase() : resolved
  }

  async function isStudentWorkspace(rootPath: string): Promise<boolean> {
    const key = workspaceKey(rootPath)
    if ((store.get('studentWorkspaces') ?? []).some((candidate) => workspaceKey(candidate) === key)) return true
    const markerPath = path.join(rootPath, '.wormie', 'student.json')
    const markerStats = await fs.lstat(markerPath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (!markerStats) return false
    if (!markerStats.isFile() || markerStats.isSymbolicLink() || markerStats.size > 4_096) throw new Error('The student workspace marker is invalid.')
    let marker: unknown
    try {
      marker = JSON.parse(await fs.readFile(markerPath, 'utf8'))
    } catch (error) {
      if (error instanceof SyntaxError) throw new Error('The student workspace marker contains invalid JSON.')
      throw error
    }
    if (!marker || typeof marker !== 'object' || (marker as { schemaVersion?: unknown }).schemaVersion !== 1 || typeof (marker as { packageId?: unknown }).packageId !== 'string') {
      throw new Error('The student workspace marker is invalid.')
    }
    markStudentWorkspace(rootPath)
    return true
  }

  function markStudentWorkspace(rootPath: string): void {
    const roots = store.get('studentWorkspaces') ?? []
    if (!roots.some((candidate) => workspaceKey(candidate) === workspaceKey(rootPath))) {
      store.set('studentWorkspaces', [...roots.slice(-99), rootPath])
    }
  }

  function requireWorkspaceRoot(expectedRoot?: string): string {
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('Open a workspace first.')
    if (expectedRoot && workspaceKey(expectedRoot) !== workspaceKey(workspaceRoot)) {
      throw new Error('The active workspace changed. Reload the assignment and try again.')
    }
    return workspaceRoot
  }

  function assertTrustedSender(event: IpcMainInvokeEvent): void {
    if (!isTrustedSender(event)) throw new Error('Assignment access was denied for this window.')
  }

  async function withProgress(
    workspaceRoot: string,
    state: AssignmentWorkspaceState
  ): Promise<AssignmentWorkspaceState> {
    const role = await isStudentWorkspace(workspaceRoot) ? 'student' : 'teacher'
    if (!state.manifest || !state.revision) return { ...state, workspaceRoot, role, progress: null }
    try {
      return { ...state, workspaceRoot, role, progress: await readProgress(progressStorageRoot, workspaceRoot, state.manifest, state.revision), progressError: undefined }
    } catch (error) {
      return { ...state, workspaceRoot, role, progress: null, progressError: error instanceof Error ? error.message : 'Assignment progress is invalid.' }
    }
  }

  ipcMain.handle(IPC_CHANNELS.assignmentGet, async (event, expectedRoot: string): Promise<AssignmentWorkspaceState> => {
    assertTrustedSender(event)
    const workspaceRoot = requireWorkspaceRoot(expectedRoot)
    try {
      const state = await readAssignment(workspaceRoot)
      return withProgress(workspaceRoot, state)
    } catch (error) {
      let revision: string | null = null
      try {
        revision = await readAssignmentRevision(workspaceRoot)
      } catch {
        revision = null
      }
      return {
        workspaceRoot,
        role: await isStudentWorkspace(workspaceRoot) ? 'student' : 'teacher',
        manifest: null,
        manifestPath: getAssignmentManifestPath(workspaceRoot),
        revision,
        progress: null,
        error: error instanceof Error ? error.message : 'The assignment manifest is invalid.'
      }
    }
  })

  ipcMain.handle(
    IPC_CHANNELS.assignmentSave,
    async (event, request: AssignmentSaveRequest): Promise<AssignmentWorkspaceState> => {
      assertTrustedSender(event)
      let payload: string
      try {
        payload = JSON.stringify(request)
      } catch {
        throw new Error('The assignment payload is not valid JSON data.')
      }
      if (Buffer.byteLength(payload, 'utf8') > maxAssignmentIpcBytes) {
        throw new Error('The assignment payload is larger than 256 KB.')
      }
      if (!request || typeof request !== 'object' || typeof request.replaceInvalid !== 'boolean') {
        throw new Error('The assignment save request is invalid.')
      }
      if (request.expectedRevision !== null && !/^[a-f0-9]{64}$/.test(request.expectedRevision)) {
        throw new Error('The assignment revision is invalid.')
      }
      const workspaceRoot = requireWorkspaceRoot(request.workspaceRoot)
      if (await isStudentWorkspace(workspaceRoot)) throw new Error('Student assignment copies cannot change teacher settings.')
      const state = await saveAssignment(workspaceRoot, request.draft, request.expectedRevision, request.replaceInvalid)
      return withProgress(workspaceRoot, state)
    }
  )

  ipcMain.handle(IPC_CHANNELS.assignmentReveal, async (event): Promise<void> => {
    assertTrustedSender(event)
    const manifestPath = getAssignmentManifestPath(requireWorkspaceRoot())
    const stats = await fs.lstat(manifestPath).catch(() => null)
    if (!stats) throw new Error('Create an assignment before revealing its manifest.')
    shell.showItemInFolder(manifestPath)
  })

  ipcMain.handle(IPC_CHANNELS.assignmentExport, async (event): Promise<AssignmentExportResult | null> => {
    assertTrustedSender(event)
    const workspaceRoot = requireWorkspaceRoot()
    if (await isStudentWorkspace(workspaceRoot)) throw new Error('Student assignment copies cannot be exported as teacher packages.')
    const assignmentPackage = await createAssignmentPackage(workspaceRoot)
    const result = await dialog.showSaveDialog({
      title: 'Export Wormie assignment package',
      defaultPath: path.join(path.dirname(workspaceRoot), `${path.basename(workspaceRoot)}.wormie-package.json`),
      filters: [{ name: 'Wormie assignment package', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    await fs.writeFile(result.filePath, assignmentPackage.payload, 'utf8')
    return {
      filePath: result.filePath,
      fileCount: assignmentPackage.value.files.length,
      totalBytes: assignmentPackage.totalBytes
    }
  })

  ipcMain.handle(IPC_CHANNELS.assignmentImport, async (event): Promise<AssignmentImportResult | null> => {
    assertTrustedSender(event)
    const packageResult = await dialog.showOpenDialog({
      title: 'Open Wormie assignment package',
      properties: ['openFile'],
      filters: [{ name: 'Wormie assignment package', extensions: ['json'] }]
    })
    if (packageResult.canceled || !packageResult.filePaths[0]) return null
    const destinationResult = await dialog.showOpenDialog({
      title: 'Choose where to create the assignment project',
      properties: ['openDirectory', 'createDirectory']
    })
    if (destinationResult.canceled || !destinationResult.filePaths[0]) return null
    const imported = await importAssignmentPackage(packageResult.filePaths[0], destinationResult.filePaths[0])
    markStudentWorkspace(imported.rootPath)
    return {
      workspace: await setWorkspace(imported.rootPath),
      assignmentTitle: imported.assignmentTitle,
      fileCount: imported.fileCount
    }
  })

  ipcMain.handle(IPC_CHANNELS.assignmentStart, async (event, request: AssignmentStartRequest) => {
    assertTrustedSender(event)
    const workspaceRoot = requireWorkspaceRoot(request?.workspaceRoot)
    const state = await readAssignment(workspaceRoot)
    if (!state.manifest || !state.revision) throw new Error('Open a project with a Wormie assignment first.')
    if (request.assignmentId !== state.manifest.id || request.assignmentRevision !== state.revision) throw new Error('The assignment changed. Reload it before starting.')
    return startProgress(progressStorageRoot, workspaceRoot, state.manifest, state.revision, request)
  })

  ipcMain.handle(IPC_CHANNELS.assignmentUpdateTask, async (event, request: AssignmentTaskProgressRequest) => {
    assertTrustedSender(event)
    const workspaceRoot = requireWorkspaceRoot(request?.workspaceRoot)
    const state = await readAssignment(workspaceRoot)
    if (!state.manifest || !state.revision) throw new Error('Open a project with a Wormie assignment first.')
    if (request.assignmentId !== state.manifest.id || request.assignmentRevision !== state.revision) throw new Error('The assignment changed. Reload it before saving progress.')
    return updateTaskProgress(progressStorageRoot, workspaceRoot, state.manifest, state.revision, request)
  })

  ipcMain.handle(IPC_CHANNELS.assignmentSubmit, async (event, request: AssignmentSubmitRequest): Promise<AssignmentSubmissionExportResult | null> => {
    assertTrustedSender(event)
    const workspaceRoot = requireWorkspaceRoot(request?.workspaceRoot)
    if (!await isStudentWorkspace(workspaceRoot)) throw new Error('Only an imported student assignment can be submitted.')
    const state = await readAssignment(workspaceRoot)
    if (!state.manifest || !state.revision) throw new Error('Open a project with a Wormie assignment first.')
    if (request.assignmentId !== state.manifest.id || request.assignmentRevision !== state.revision) throw new Error('The assignment changed. Reload it before submitting.')
    const progress = await readProgress(progressStorageRoot, workspaceRoot, state.manifest, state.revision)
    if (!progress) throw new Error('Start the assignment before submitting it.')
    if (progress.revision !== request.expectedProgressRevision) throw new Error('Progress changed since it was loaded. Reload the assignment and try again.')
    if (Object.values(progress.tasks).some((task) => task.status !== 'completed')) throw new Error('Complete every assignment task before submitting.')
    const submittedAt = new Date().toISOString()
    const submittedProgress = prepareSubmittedProgress(progress, submittedAt)
    const activity = submittedProgress.evidenceConsent.includeAiActivity
      ? await readAiActivity(progressStorageRoot, workspaceRoot, state.manifest, state.revision)
      : []
    const prepared = await createAssignmentSubmission(workspaceRoot, state.manifest, state.revision, submittedProgress, activity)
    const result = await dialog.showSaveDialog({
      title: 'Save Wormie submission',
      defaultPath: path.join(path.dirname(workspaceRoot), `${state.manifest.title} - ${progress.student.name}.wormie-submission.json`),
      filters: [{ name: 'Wormie submission', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePath) return null
    if (isPathInside(workspaceRoot, path.resolve(result.filePath))) throw new Error('Save submissions outside the project so student identity and evidence cannot enter source control.')
    const destinationStats = await fs.lstat(result.filePath).catch((error: NodeJS.ErrnoException) => {
      if (error.code === 'ENOENT') return null
      throw error
    })
    if (destinationStats && (!destinationStats.isFile() || destinationStats.isSymbolicLink())) throw new Error('Choose a regular submission destination.')
    await fs.writeFile(result.filePath, prepared.payload, 'utf8')
    try {
      await commitSubmittedProgress(progressStorageRoot, workspaceRoot, state.manifest, state.revision, request.expectedProgressRevision, submittedProgress)
    } catch (error) {
      try {
        await fs.unlink(result.filePath)
      } catch (cleanupError) {
        const original = error instanceof Error ? error.message : 'Progress could not be finalized.'
        const cleanup = cleanupError instanceof Error ? cleanupError.message : 'Unknown cleanup error.'
        throw new Error(`${original} The incomplete submission file could not be removed: ${cleanup}`)
      }
      throw error
    }
    return { filePath: result.filePath, submission: prepared.submission }
  })

  ipcMain.handle(IPC_CHANNELS.assignmentOpenSubmission, async (event, expectedRoot: string): Promise<AssignmentSubmission | null> => {
    assertTrustedSender(event)
    const workspaceRoot = requireWorkspaceRoot(expectedRoot)
    if (await isStudentWorkspace(workspaceRoot)) throw new Error('Open submissions from the teacher workspace.')
    const state = await readAssignment(workspaceRoot)
    if (!state.manifest || !state.revision) throw new Error('Open the matching teacher assignment first.')
    const result = await dialog.showOpenDialog({
      title: 'Open Wormie submission',
      properties: ['openFile'],
      filters: [{ name: 'Wormie submission', extensions: ['json'] }]
    })
    if (result.canceled || !result.filePaths[0]) return null
    return readAssignmentSubmission(result.filePaths[0], state.manifest, state.revision)
  })
}
