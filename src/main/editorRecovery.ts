import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type Store from 'electron-store'
import { IPC_CHANNELS, type AutosaveSettings, type EditorRecoveryDocument, type EditorRecoveryState, type FileViewState } from '../shared/contracts'
import { isPathInside } from './pathSafety'

const maximumDocuments = 30
const maximumDirtyCharacters = 2_000_000
const defaultAutosave: AutosaveSettings = { mode: 'afterDelay', delayMs: 1000, saveOnExit: true }

function viewState(value: unknown): FileViewState {
  const candidate = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const positive = (input: unknown, fallback: number) => typeof input === 'number' && Number.isFinite(input) && input >= 0 ? input : fallback
  return {
    line: Math.max(1, Math.floor(positive(candidate.line, 1))),
    column: Math.max(1, Math.floor(positive(candidate.column, 1))),
    scrollTop: positive(candidate.scrollTop, 0),
    scrollLeft: positive(candidate.scrollLeft, 0)
  }
}

function autosaveSettings(value: unknown, legacy: boolean): AutosaveSettings {
  if (!value || typeof value !== 'object') return defaultAutosave
  const candidate = value as Record<string, unknown>
  if (!['off', 'afterDelay', 'onFocusChange'].includes(String(candidate.mode))) return defaultAutosave
  if (typeof candidate.delayMs !== 'number' || !Number.isInteger(candidate.delayMs) || candidate.delayMs < 250 || candidate.delayMs > 10_000) {
    return defaultAutosave
  }
  const mode = legacy && candidate.mode === 'off' ? 'afterDelay' : candidate.mode as AutosaveSettings['mode']
  return {
    mode,
    delayMs: candidate.delayMs,
    saveOnExit: typeof candidate.saveOnExit === 'boolean' ? candidate.saveOnExit : true
  }
}

export function parseEditorRecovery(value: unknown): EditorRecoveryState | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Record<string, unknown>
  if ((candidate.schemaVersion !== 1 && candidate.schemaVersion !== 2) || typeof candidate.workspaceRoot !== 'string' || candidate.workspaceRoot.length === 0 || candidate.workspaceRoot.length > 2_000) return null
  if (!Array.isArray(candidate.documents)) return null

  let dirtyCharacters = 0
  const documents: EditorRecoveryDocument[] = []
  for (const rawDocument of candidate.documents.slice(0, maximumDocuments)) {
    if (!rawDocument || typeof rawDocument !== 'object') continue
    const document = rawDocument as Record<string, unknown>
    if (typeof document.path !== 'string' || document.path.length === 0 || document.path.length > 2_000) continue
    const recovered: EditorRecoveryDocument = { path: document.path, view: viewState(document.view) }
    if (typeof document.dirtyContent === 'string' && document.dirtyContent.length <= maximumDirtyCharacters - dirtyCharacters) {
      recovered.dirtyContent = document.dirtyContent
      dirtyCharacters += document.dirtyContent.length
    }
    documents.push(recovered)
  }

  const activePath = typeof candidate.activePath === 'string' && candidate.activePath.length <= 2_000 ? candidate.activePath : null
  const closedPaths = Array.isArray(candidate.closedPaths)
    ? candidate.closedPaths.filter((item): item is string => typeof item === 'string' && item.length > 0 && item.length <= 2_000).slice(0, 20)
    : []
  return {
    schemaVersion: 2,
    workspaceRoot: candidate.workspaceRoot,
    activePath,
    autosave: autosaveSettings(candidate.autosave, candidate.schemaVersion === 1),
    documents,
    closedPaths
  }
}

export function registerEditorRecoveryHandlers(
  store: Store<{ state?: unknown }>,
  getWorkspaceRoot: () => string | null,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean
): void {
  const assertTrusted = (event: IpcMainInvokeEvent) => {
    if (!isTrustedSender(event)) throw new Error('Editor recovery access was denied for this window.')
  }

  ipcMain.handle(IPC_CHANNELS.editorRecoveryLoad, (event, workspaceRoot: string): EditorRecoveryState | null => {
    assertTrusted(event)
    const activeRoot = getWorkspaceRoot()
    if (typeof workspaceRoot !== 'string' || workspaceRoot !== activeRoot) throw new Error('Editor recovery belongs to a different workspace.')
    const state = parseEditorRecovery(store.get('state'))
    return state?.workspaceRoot === activeRoot ? state : null
  })

  ipcMain.handle(IPC_CHANNELS.editorRecoverySave, (event, value: unknown): void => {
    assertTrusted(event)
    const state = parseEditorRecovery(value)
    const activeRoot = getWorkspaceRoot()
    if (!state || !activeRoot || state.workspaceRoot !== activeRoot) throw new Error('Editor recovery state is invalid for this workspace.')
    for (const document of state.documents) {
      if (!isPathInside(activeRoot, document.path)) throw new Error('Editor recovery contains a path outside the workspace.')
    }
    if (state.activePath && !isPathInside(activeRoot, state.activePath)) throw new Error('Editor recovery contains an invalid active file.')
    store.set('state', state)
  })
}
