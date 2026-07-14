import { create } from 'zustand'
import type { OpenFile, WorkspaceSnapshot } from '@shared/contracts'

export type EditorDocument = OpenFile & {
  savedContent: string
}

type Activity = 'explorer' | 'learning' | 'settings'
type BottomView = 'problems' | 'output' | 'quiz'

type WorkbenchState = {
  workspace: WorkspaceSnapshot | null
  documents: EditorDocument[]
  activePath: string | null
  activity: Activity
  bottomView: BottomView
  output: string[]
  passingScore: number
  setWorkspace: (workspace: WorkspaceSnapshot) => void
  openDocument: (file: OpenFile) => void
  updateDocument: (filePath: string, content: string) => void
  markSaved: (filePath: string) => void
  closeDocument: (filePath: string) => void
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
  activity: 'explorer',
  bottomView: 'output',
  output: ['Workbench ready. Open a folder to begin.'],
  passingScore: 80,
  setWorkspace: (workspace) =>
    set((state) => ({
      workspace,
      output: [...state.output, `Opened workspace ${workspace.name}.`]
    })),
  openDocument: (file) =>
    set((state) => {
      const existingDocument = state.documents.some((document) => document.path === file.path)
      return {
        documents: existingDocument
          ? state.documents
          : [...state.documents, { ...file, savedContent: file.content }],
        activePath: file.path
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
        activePath: state.activePath === filePath ? (nextDocument?.path ?? null) : state.activePath
      }
    }),
  setActivePath: (activePath) => set({ activePath }),
  setActivity: (activity) => set({ activity }),
  setBottomView: (bottomView) => set({ bottomView }),
  addOutput: (message) => set((state) => ({ output: [...state.output, message] })),
  setPassingScore: (passingScore) => set({ passingScore })
}))

