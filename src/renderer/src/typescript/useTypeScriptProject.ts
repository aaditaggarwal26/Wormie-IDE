import { useEffect, useRef } from 'react'
import * as monaco from 'monaco-editor'
import { useWorkbench } from '@/store/workbench'
import { languageForTypeScriptProjectFile, selectTypeScriptProjectFiles } from './projectFiles'
import { workspacePathToFileUri } from './fileUri'
import { isCurrentWorkspaceRequest, withRequestTimeout } from './requestGuard'

const maximumProjectCharacters = 12_000_000
const readBatchSize = 8

export function useTypeScriptProject(): void {
  const workspaceRoot = useWorkbench((state) => state.workspace?.rootPath ?? null)
  const addOutput = useWorkbench((state) => state.addOutput)
  const generation = useRef(0)

  useEffect(() => {
    if (!workspaceRoot) return
    const currentGeneration = ++generation.current
    let active = true
    const ownedModels: monaco.editor.ITextModel[] = []

    void (async () => {
      const index = await withRequestTimeout(window.desktop.listWorkspaceFiles(), 10_000, 'TypeScript project indexing timed out.')
      if (!active || index.workspaceRoot !== workspaceRoot || !isCurrentWorkspaceRequest(workspaceRoot, currentGeneration, useWorkbench.getState().workspace?.rootPath, generation.current)) return
      const files = selectTypeScriptProjectFiles(index.files)
      let loadedCharacters = 0
      for (let start = 0; start < files.length && loadedCharacters < maximumProjectCharacters; start += readBatchSize) {
        const batch = await Promise.all(files.slice(start, start + readBatchSize).map(async (file) => {
          try {
            return await withRequestTimeout(window.desktop.readFile(file.path), 8_000, `Reading ${file.relativePath} timed out.`)
          } catch {
            return null
          }
        }))
        if (!active || !isCurrentWorkspaceRequest(workspaceRoot, currentGeneration, useWorkbench.getState().workspace?.rootPath, generation.current)) return
        for (const file of batch) {
          if (!file || loadedCharacters + file.content.length > maximumProjectCharacters) continue
          loadedCharacters += file.content.length
          const uri = monaco.Uri.parse(workspacePathToFileUri(file.path, window.desktop.platform))
          if (monaco.editor.getModel(uri)) continue
          ownedModels.push(monaco.editor.createModel(file.content, languageForTypeScriptProjectFile(file.path), uri))
        }
      }
      if (index.truncated) addOutput('TypeScript project intelligence is using the bounded workspace file index.')
    })().catch((error) => {
      if (active && generation.current === currentGeneration) addOutput(`TypeScript project intelligence could not start: ${error instanceof Error ? error.message : 'Unknown error.'}`)
    })

    return () => {
      active = false
      generation.current += 1
      for (const model of ownedModels) if (!model.isDisposed()) model.dispose()
    }
  }, [addOutput, workspaceRoot])
}
