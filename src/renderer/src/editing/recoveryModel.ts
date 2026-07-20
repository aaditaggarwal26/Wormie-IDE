import type { AutosaveSettings, EditorRecoveryDocument, EditorRecoveryState, OpenFile } from '@shared/contracts'
import type { EditorDocument } from '@/store/workbench'

export function mergeRecoveredFile(file: OpenFile | null, recovery: EditorRecoveryDocument): EditorDocument | null {
  if (!file) return null
  return {
    ...file,
    content: recovery.dirtyContent ?? file.content,
    savedContent: file.content,
    view: recovery.view ?? { line: 1, column: 1, scrollTop: 0, scrollLeft: 0 }
  }
}

export function buildEditorRecovery(
  workspaceRoot: string,
  documents: EditorDocument[],
  activePath: string | null,
  closedPaths: string[],
  autosave: AutosaveSettings
): EditorRecoveryState {
  return {
    schemaVersion: 1,
    workspaceRoot,
    activePath,
    autosave,
    closedPaths: closedPaths.slice(0, 20),
    documents: documents.slice(0, 30).map((document) => ({
      path: document.path,
      dirtyContent: document.content !== document.savedContent ? document.content : undefined,
      view: document.view
    }))
  }
}
