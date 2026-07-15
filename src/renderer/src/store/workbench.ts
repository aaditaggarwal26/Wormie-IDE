import { create } from 'zustand'
import type { OpenFile, WorkspaceSnapshot } from '@shared/contracts'

export type EditorDocument = OpenFile & {
  savedContent: string
}

type Activity = 'explorer' | 'search' | 'sourceControl' | 'assignments' | 'learning' | 'settings'
type BottomView = 'problems' | 'output' | 'terminal' | 'quiz'

type WorkbenchState = {
  workspace: WorkspaceSnapshot | null
  documents: EditorDocument[]
  activePath: string | null
  revealLine: number | null
  cursorLine: number
  cursorColumn: number
  activity: Activity
  bottomView: BottomView
  output: string[]
  passingScore: number
  setWorkspace: (workspace: WorkspaceSnapshot) => void
  openDocument: (file: OpenFile, line?: number) => void
  updateDocument: (filePath: string, content: string) => void
  markSaved: (filePath: string) => void
  closeDocument: (filePath: string) => void
  moveDocuments: (previousPath: string, nextPath: string) => void
  removeDocuments: (entryPath: string) => void
  consumeRevealLine: () => void
  setCursorPosition: (line: number, column: number) => void
  setActivePath: (filePath: string) => void
  setActivity: (activity: Activity) => void
  setBottomView: (view: BottomView) => void
  addOutput: (message: string) => void
  setPassingScore: (score: number) => void
}

export const useWorkbench = create<WorkbenchState>((set) => ({
  workspace: null,
  documents: [],
  activePath: null,
  revealLine: null,
  cursorLine: 1,
  cursorColumn: 1,
  activity: 'explorer',
  bottomView: 'output',
  output: ['Workbench ready. Open a folder to begin.'],
  passingScore: 80,
  setWorkspace: (workspace) =>
    set((state) => {
      const changedWorkspace = state.workspace?.rootPath !== workspace.rootPath
      return {
        workspace,
        documents: changedWorkspace ? [] : state.documents,
        activePath: changedWorkspace ? null : state.activePath,
        revealLine: changedWorkspace ? null : state.revealLine,
        output: changedWorkspace ? [...state.output, `Opened workspace ${workspace.name}.`] : state.output
      }
    }),
  openDocument: (file, line) =>
    set((state) => {
      const existingDocument = state.documents.some((document) => document.path === file.path)
      return {
        documents: existingDocument
          ? state.documents
          : [...state.documents, { ...file, savedContent: file.content }],
        activePath: file.path,
        revealLine: line ?? null
      }
    }),
  updateDocument: (filePath, content) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.path === filePath ? { ...document, content } : document
      )
    })),
  markSaved: (filePath) =>
    set((state) => ({
      documents: state.documents.map((document) =>
        document.path === filePath ? { ...document, savedContent: document.content } : document
      ),
      output: [...state.output, `Saved ${filePath}.`]
    })),
  closeDocument: (filePath) =>
    set((state) => {
      const remainingDocuments = state.documents.filter((document) => document.path !== filePath)
      const closingIndex = state.documents.findIndex((document) => document.path === filePath)
      const nextDocument = remainingDocuments[Math.max(0, closingIndex - 1)] ?? remainingDocuments[0]
      return {
        documents: remainingDocuments,
        activePath: state.activePath === filePath ? (nextDocument?.path ?? null) : state.activePath,
        revealLine: null
      }
    }),
  moveDocuments: (previousPath, nextPath) =>
    set((state) => {
      const movePath = (filePath: string) => {
        if (filePath === previousPath) return nextPath
        if (filePath.startsWith(`${previousPath}\\`) || filePath.startsWith(`${previousPath}/`)) {
          return `${nextPath}${filePath.slice(previousPath.length)}`
        }
        return filePath
      }

      return {
        documents: state.documents.map((document) => {
          const movedPath = movePath(document.path)
          return movedPath === document.path
            ? document
            : { ...document, path: movedPath, name: movedPath.split(/[\\/]/).at(-1) ?? document.name }
        }),
        activePath: state.activePath ? movePath(state.activePath) : null
      }
    }),
  removeDocuments: (entryPath) =>
    set((state) => {
      const isRemoved = (filePath: string) =>
        filePath === entryPath || filePath.startsWith(`${entryPath}\\`) || filePath.startsWith(`${entryPath}/`)
      const documents = state.documents.filter((document) => !isRemoved(document.path))
      return {
        documents,
        activePath: state.activePath && isRemoved(state.activePath) ? (documents.at(-1)?.path ?? null) : state.activePath
      }
    }),
  consumeRevealLine: () => set({ revealLine: null }),
  setCursorPosition: (cursorLine, cursorColumn) => set({ cursorLine, cursorColumn }),
  setActivePath: (activePath) => set({ activePath }),
  setActivity: (activity) => set({ activity }),
  setBottomView: (bottomView) => set({ bottomView }),
  addOutput: (message) => set((state) => ({
    bottomView: 'output',
    output: [...state.output, message]
  })),
  setPassingScore: (passingScore) => set({ passingScore })
}))
