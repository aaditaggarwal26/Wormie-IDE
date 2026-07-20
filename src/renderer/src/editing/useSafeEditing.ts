import { useCallback, useEffect, useRef, useState } from 'react'
import { useWorkbench, type EditorDocument, type ExternalFileChange } from '@/store/workbench'
import { autosaveCandidates, dirtyDocuments } from './editingPolicy'
import { buildEditorRecovery, mergeRecoveredFile } from './recoveryModel'

function message(error: unknown): string {
  return (error instanceof Error ? error.message : 'An unexpected error occurred.')
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
    .replace(/^Error:\s*/i, '')
}

export type DirtyDialogState = {
  paths: string[]
  busy: boolean
  error: string | null
  cancel: () => void
  discard: () => void
  save: () => void
}

export type ExternalConflictState = {
  filePath: string
  change: ExternalFileChange
  document: EditorDocument
  closeEditor: () => void
  keepLocal: () => void
  reload: () => void
}

export function useSafeEditing() {
  const workspace = useWorkbench((state) => state.workspace)
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const closedPaths = useWorkbench((state) => state.closedPaths)
  const autosave = useWorkbench((state) => state.autosave)
  const proposalReview = useWorkbench((state) => state.proposalReview)
  const externalChanges = useWorkbench((state) => state.externalChanges)
  const addOutput = useWorkbench((state) => state.addOutput)
  const [recoveryReadyRoot, setRecoveryReadyRoot] = useState<string | null>(null)
  const [dirtyPaths, setDirtyPaths] = useState<string[]>([])
  const [dirtyBusy, setDirtyBusy] = useState(false)
  const [dirtyError, setDirtyError] = useState<string | null>(null)
  const pendingAction = useRef<(() => void) | null>(null)

  const persistRecovery = useCallback(async (): Promise<void> => {
    const state = useWorkbench.getState()
    if (!state.workspace) return
    await window.desktop.saveEditorRecovery(buildEditorRecovery(
      state.workspace.rootPath,
      state.documents,
      state.activePath,
      state.closedPaths,
      state.autosave
    ))
  }, [])

  const saveDocumentPaths = useCallback(async (filePaths: string[]): Promise<void> => {
    const proposalPaths = new Set(useWorkbench.getState().proposalReview?.files.map((file) => file.absolutePath) ?? [])
    for (const filePath of filePaths) {
      const document = useWorkbench.getState().documents.find((candidate) => candidate.path === filePath)
      if (!document || document.content === document.savedContent || proposalPaths.has(filePath)) continue
      const result = await window.desktop.writeFile({
        filePath,
        content: document.content,
        expectedFingerprint: document.fingerprint
      })
      useWorkbench.getState().markSaved(result.path, result.fingerprint)
    }
  }, [])

  const requestDirtyAction = useCallback((filePaths: string[], action: () => void) => {
    const requested = new Set(filePaths)
    const nextDirtyPaths = dirtyDocuments(useWorkbench.getState().documents)
      .filter((document) => requested.has(document.path))
      .map((document) => document.path)
    if (nextDirtyPaths.length === 0) {
      action()
      return
    }
    pendingAction.current = action
    setDirtyPaths(nextDirtyPaths)
    setDirtyError(null)
  }, [])

  const runWorkspaceChangingAction = useCallback((action: () => void) => {
    if (useWorkbench.getState().proposalReview && !window.confirm('Discard the unresolved AI proposal review and switch workspaces?')) return
    requestDirtyAction(useWorkbench.getState().documents.map((document) => document.path), () => {
      void persistRecovery().catch((error) => {
        addOutput(`Could not save editor recovery: ${message(error)}`)
      }).finally(action)
    })
  }, [addOutput, persistRecovery, requestDirtyAction])

  const closeEditorSafely = useCallback((filePath: string) => {
    requestDirtyAction([filePath], () => useWorkbench.getState().closeDocument(filePath))
  }, [requestDirtyAction])

  const onEditorBlur = useCallback((filePath: string) => {
    if (useWorkbench.getState().autosave.mode !== 'onFocusChange') return
    const proposalPaths = new Set(useWorkbench.getState().proposalReview?.files.map((file) => file.absolutePath) ?? [])
    if (proposalPaths.has(filePath)) return
    void saveDocumentPaths([filePath]).catch((error) => addOutput(`Autosave stopped: ${message(error)}`))
  }, [addOutput, saveDocumentPaths])

  useEffect(() => {
    if (!workspace) {
      setRecoveryReadyRoot(null)
      return
    }
    let active = true
    const workspaceRoot = workspace.rootPath
    setRecoveryReadyRoot(null)
    void window.desktop.loadEditorRecovery(workspaceRoot).then(async (recovery) => {
      if (!recovery) return
      const recovered = await Promise.all(recovery.documents.map(async (document) => {
        try {
          return mergeRecoveredFile(await window.desktop.readFile(document.path), document)
        } catch {
          return null
        }
      }))
      if (!active || useWorkbench.getState().workspace?.rootPath !== workspaceRoot) return
      useWorkbench.getState().restoreSession(
        recovered.filter((document) => document !== null),
        recovery.activePath,
        recovery.closedPaths,
        recovery.autosave
      )
    }).catch((error) => {
      if (active) addOutput(`Could not restore the previous editor session: ${message(error)}`)
    }).finally(() => {
      if (active && useWorkbench.getState().workspace?.rootPath === workspaceRoot) setRecoveryReadyRoot(workspaceRoot)
    })
    return () => { active = false }
  }, [addOutput, workspace?.rootPath])

  useEffect(() => {
    if (!workspace || recoveryReadyRoot !== workspace.rootPath) return
    const timeout = window.setTimeout(() => {
      void persistRecovery().catch((error) => addOutput(`Could not save editor recovery: ${message(error)}`))
    }, 300)
    return () => window.clearTimeout(timeout)
  }, [activePath, addOutput, autosave, closedPaths, documents, persistRecovery, recoveryReadyRoot, workspace?.rootPath])

  useEffect(() => {
    if (dirtyDocuments(documents).length === 0 && !proposalReview) return
    const preventUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', preventUnload)
    return () => window.removeEventListener('beforeunload', preventUnload)
  }, [documents, proposalReview])

  useEffect(() => {
    if (!workspace) return
    const proposalPaths = new Set(useWorkbench.getState().proposalReview?.files.map((file) => file.absolutePath) ?? [])
    const paths = documents.map((document) => document.path).filter((filePath) => !proposalPaths.has(filePath))
    void window.desktop.watchWorkspaceFiles(paths).catch((error) => addOutput(`Could not watch open files: ${message(error)}`))
  }, [addOutput, documents.map((document) => document.path).join('\n'), workspace?.rootPath])

  useEffect(() => window.desktop.onWorkspaceFileChanged((change) => {
    const state = useWorkbench.getState()
    if (state.workspace?.rootPath !== change.workspaceRoot) return
    const document = state.documents.find((candidate) => candidate.path === change.filePath)
    if (!document || change.fingerprint === document.fingerprint) return
    const dirty = document.content !== document.savedContent
    if (change.kind === 'deleted') {
      if (dirty) state.setExternalChange(change.filePath, { kind: 'deleted', diskFile: null })
      else state.closeDocument(change.filePath)
      return
    }
    void window.desktop.readFile(change.filePath).then((diskFile) => {
      const current = useWorkbench.getState()
      if (current.workspace?.rootPath !== change.workspaceRoot || diskFile.fingerprint !== change.fingerprint) return
      const currentDocument = current.documents.find((candidate) => candidate.path === change.filePath)
      if (!currentDocument || currentDocument.fingerprint === diskFile.fingerprint) return
      if (currentDocument.content === currentDocument.savedContent) current.replaceDocumentFromDisk(diskFile)
      else current.setExternalChange(change.filePath, { kind: 'changed', diskFile })
    }).catch(() => undefined)
  }), [])

  useEffect(() => {
    if (autosave.mode !== 'afterDelay') return
    const proposalPaths = new Set(useWorkbench.getState().proposalReview?.files.map((file) => file.absolutePath) ?? [])
    const paths = autosaveCandidates(documents, proposalPaths).map((document) => document.path)
    if (paths.length === 0) return
    const timeout = window.setTimeout(() => {
      void saveDocumentPaths(paths).catch((error) => addOutput(`Autosave stopped: ${message(error)}`))
    }, autosave.delayMs)
    return () => window.clearTimeout(timeout)
  }, [addOutput, autosave, documents, saveDocumentPaths])

  const externalEntry = Object.entries(externalChanges).find(([filePath]) => documents.some((document) => document.path === filePath))
  const externalDocument = externalEntry ? documents.find((document) => document.path === externalEntry[0]) : null

  const keepExternalLocal = useCallback((filePath: string) => {
    const state = useWorkbench.getState()
    const change = state.externalChanges[filePath]
    const document = state.documents.find((candidate) => candidate.path === filePath)
    if (!change || !document) return
    if (change.diskFile) {
      state.keepLocalVersion(filePath, change.diskFile.fingerprint)
      return
    }
    const parentPath = filePath.replace(/[\\/][^\\/]+$/, '')
    const name = filePath.split(/[\\/]/).at(-1)
    if (!name || parentPath === filePath) return
    void window.desktop.createEntry(parentPath, name, 'file').then(async (created) => {
      if (useWorkbench.getState().workspace?.rootPath !== created.workspace.rootPath) return
      useWorkbench.getState().setWorkspace(created.workspace)
      const emptyFile = await window.desktop.readFile(created.path)
      const written = await window.desktop.writeFile({ filePath: created.path, content: document.content, expectedFingerprint: emptyFile.fingerprint })
      useWorkbench.getState().markSaved(written.path, written.fingerprint)
      useWorkbench.getState().clearExternalChange(filePath)
    }).catch((error) => addOutput(`Could not restore the deleted file: ${message(error)}`))
  }, [addOutput])

  const dirtyDialog: DirtyDialogState | null = dirtyPaths.length > 0 ? {
    paths: dirtyPaths,
    busy: dirtyBusy,
    error: dirtyError,
    cancel: () => {
      pendingAction.current = null
      setDirtyPaths([])
      setDirtyError(null)
    },
    discard: () => {
      const action = pendingAction.current
      useWorkbench.getState().discardDocumentChanges(dirtyPaths)
      pendingAction.current = null
      setDirtyPaths([])
      setDirtyError(null)
      action?.()
    },
    save: () => {
      setDirtyBusy(true)
      setDirtyError(null)
      void saveDocumentPaths(dirtyPaths).then(() => {
        const action = pendingAction.current
        pendingAction.current = null
        setDirtyPaths([])
        action?.()
      }).catch((error) => setDirtyError(message(error))).finally(() => setDirtyBusy(false))
    }
  } : null

  const externalConflict: ExternalConflictState | null = externalEntry && externalDocument ? {
    filePath: externalEntry[0],
    change: externalEntry[1],
    document: externalDocument,
    closeEditor: () => {
      const state = useWorkbench.getState()
      state.discardDocumentChanges([externalEntry[0]])
      state.clearExternalChange(externalEntry[0])
      state.closeDocument(externalEntry[0])
    },
    keepLocal: () => keepExternalLocal(externalEntry[0]),
    reload: () => {
      if (externalEntry[1].diskFile) useWorkbench.getState().replaceDocumentFromDisk(externalEntry[1].diskFile)
    }
  } : null

  return {
    closeEditorSafely,
    dirtyDialog,
    externalConflict,
    onEditorBlur,
    recoveryReadyRoot,
    requestDirtyAction,
    runWorkspaceChangingAction,
    saveDocumentPaths
  }
}
