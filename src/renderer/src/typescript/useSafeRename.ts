import { useCallback, useState, type RefObject } from 'react'
import * as monaco from 'monaco-editor'
import { useWorkbench } from '@/store/workbench'
import { buildRenamePreview, type RenamePreviewFile, type RenameSourceFile, type WorkerRenameLocation } from './renamePreview'
import { fileUriToPath, isWorkspaceFilePath, workspacePathToFileUri } from './fileUri'
import { isTypeScriptProjectFile } from './projectFiles'
import { withRequestTimeout } from './requestGuard'

type RenameTrigger = { uri: monaco.Uri; offset: number; originalName: string; workspaceRoot: string }

export type SafeRenameState = {
  phase: 'name' | 'loading' | 'preview' | 'applying'
  originalName: string
  newName: string
  files: RenamePreviewFile[]
  selectedPaths: Set<string>
  error: string | null
}

const identifierPattern = /^[$_\p{ID_Start}][$\u200C\u200D_\p{ID_Continue}]*$/u

export function useSafeRename(editorRef: RefObject<monaco.editor.IStandaloneCodeEditor | null>) {
  const [state, setState] = useState<SafeRenameState | null>(null)
  const [trigger, setTrigger] = useState<RenameTrigger | null>(null)

  const begin = useCallback(async () => {
    const editor = editorRef.current
    const model = editor?.getModel()
    const position = editor?.getPosition()
    const workspace = useWorkbench.getState().workspace
    if (!editor || !model || !position || !workspace || !isTypeScriptProjectFile(model.uri.path)) return
    const activeDocument = useWorkbench.getState().documents.find((document) => document.path === useWorkbench.getState().activePath)
    if (activeDocument && activeDocument.content !== activeDocument.savedContent) {
      setState({ phase: 'name', originalName: '', newName: '', files: [], selectedPaths: new Set(), error: 'Save the current file before preparing a workspace rename.' })
      return
    }
    try {
      const accessor = model.getLanguageId() === 'javascript'
        ? await monaco.languages.typescript.getJavaScriptWorker()
        : await monaco.languages.typescript.getTypeScriptWorker()
      const worker = await withRequestTimeout(accessor(model.uri), 8_000, 'Rename request timed out.')
      const offset = model.getOffsetAt(position)
      const info = await withRequestTimeout(worker.getRenameInfo(model.uri.toString(), offset, {}), 8_000, 'Rename request timed out.')
      if (!info?.canRename) throw new Error(info?.localizedErrorMessage ?? 'This symbol cannot be renamed.')
      const originalName = String(info.displayName ?? model.getWordAtPosition(position)?.word ?? '')
      setTrigger({ uri: model.uri, offset, originalName, workspaceRoot: workspace.rootPath })
      setState({ phase: 'name', originalName, newName: originalName, files: [], selectedPaths: new Set(), error: null })
    } catch (error) {
      setState({ phase: 'name', originalName: '', newName: '', files: [], selectedPaths: new Set(), error: error instanceof Error ? error.message : 'Rename request failed.' })
    }
  }, [editorRef])

  const preview = useCallback(async (newName: string) => {
    if (!trigger || !state) return
    if (!identifierPattern.test(newName) || newName === trigger.originalName) {
      setState((current) => current && ({ ...current, newName, error: newName === trigger.originalName ? 'Enter a different symbol name.' : 'Enter a valid JavaScript or TypeScript identifier.' }))
      return
    }
    const workspaceRoot = trigger.workspaceRoot
    setState((current) => current && ({ ...current, phase: 'loading', newName, error: null }))
    try {
      const model = monaco.editor.getModel(trigger.uri)
      if (!model) throw new Error('The rename source is no longer open.')
      const accessor = model.getLanguageId() === 'javascript'
        ? await monaco.languages.typescript.getJavaScriptWorker()
        : await monaco.languages.typescript.getTypeScriptWorker()
      const worker = await withRequestTimeout(accessor(trigger.uri), 8_000, 'Rename request timed out.')
      const locations = await withRequestTimeout(
        worker.findRenameLocations(trigger.uri.toString(), trigger.offset, false, false, true) as Promise<readonly WorkerRenameLocation[] | undefined>,
        8_000,
        'Rename request timed out.'
      )
      if (useWorkbench.getState().workspace?.rootPath !== workspaceRoot) return
      if (!locations?.length) throw new Error('No rename locations were found.')
      const uniqueNames = [...new Set(locations.map((location) => location.fileName))]
      if (uniqueNames.length > 200) throw new Error('This rename touches too many files to preview safely.')
      const sourceByUri = new Map<string, RenameSourceFile>()
      await Promise.all(uniqueNames.map(async (fileName) => {
        const filePath = fileName.startsWith('file:') ? fileUriToPath(fileName, window.desktop.platform) : fileName
        if (!isWorkspaceFilePath(workspaceRoot, filePath, window.desktop.platform)) throw new Error('Rename results escaped the active workspace.')
        const file = await withRequestTimeout(window.desktop.readFile(filePath), 8_000, `Reading ${filePath} timed out.`)
        sourceByUri.set(fileName, { path: file.path, content: file.content, fingerprint: file.fingerprint })
      }))
      if (useWorkbench.getState().workspace?.rootPath !== workspaceRoot) return
      const files = buildRenamePreview(newName, [...locations], sourceByUri)
      const dirtyPaths = new Set(useWorkbench.getState().documents.filter((document) => document.content !== document.savedContent).map((document) => document.path))
      if (files.some((file) => dirtyPaths.has(file.path))) throw new Error('Save or close locally changed rename files before continuing.')
      setState({ phase: 'preview', originalName: trigger.originalName, newName, files, selectedPaths: new Set(files.map((file) => file.path)), error: null })
    } catch (error) {
      if (useWorkbench.getState().workspace?.rootPath === workspaceRoot) {
        setState((current) => current && ({ ...current, phase: 'name', error: error instanceof Error ? error.message : 'Rename preview failed.' }))
      }
    }
  }, [state, trigger])

  const apply = useCallback(async () => {
    if (!state || !trigger || state.phase !== 'preview' || state.selectedPaths.size === 0) return
    const workspaceRoot = trigger.workspaceRoot
    setState((current) => current && ({ ...current, phase: 'applying', error: null }))
    try {
      const result = await window.desktop.replaceWorkspace({
        workspaceRoot,
        files: state.files.filter((file) => state.selectedPaths.has(file.path)).map((file) => ({
          filePath: file.path,
          expectedFingerprint: file.fingerprint,
          edits: file.edits
        }))
      })
      if (useWorkbench.getState().workspace?.rootPath !== result.workspaceRoot) return
      const failures = result.outcomes.filter((outcome) => outcome.status === 'failed')
      await Promise.all(result.outcomes.filter((outcome) => outcome.status === 'applied').map(async (outcome) => {
        const file = await window.desktop.readFile(outcome.filePath)
        const current = useWorkbench.getState()
        if (current.workspace?.rootPath !== workspaceRoot) return
        const document = current.documents.find((candidate) => candidate.path === file.path)
        if (!document || document.content === document.savedContent) current.replaceDocumentFromDisk(file)
        else current.setExternalChange(file.path, { kind: 'changed', diskFile: file })
        const model = monaco.editor.getModel(monaco.Uri.parse(workspacePathToFileUri(file.path, window.desktop.platform)))
        if (model && model.getValue() !== file.content && (!document || document.content === document.savedContent)) model.setValue(file.content)
      }))
      if (failures.length > 0) {
        setState((current) => current && ({ ...current, phase: 'preview', error: failures.map((failure) => `${failure.filePath}: ${failure.message}`).join('\n') }))
      } else {
        setState(null)
        setTrigger(null)
      }
    } catch (error) {
      setState((current) => current && ({ ...current, phase: 'preview', error: error instanceof Error ? error.message : 'Rename failed.' }))
    }
  }, [state, trigger])

  return {
    state,
    begin,
    preview,
    apply,
    close: () => { setState(null); setTrigger(null) },
    setNewName: (newName: string) => setState((current) => current && ({ ...current, newName, error: null })),
    toggleFile: (filePath: string) => setState((current) => {
      if (!current) return current
      const selectedPaths = new Set(current.selectedPaths)
      if (selectedPaths.has(filePath)) selectedPaths.delete(filePath)
      else selectedPaths.add(filePath)
      return { ...current, selectedPaths }
    })
  }
}
