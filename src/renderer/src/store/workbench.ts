import { create } from 'zustand'
import type { CodeProposal, OpenFile, WorkspaceSnapshot } from '@shared/contracts'
import { languageForPath, resolveProposalPath } from '@/components/proposalReviewModel'

export type EditorDocument = OpenFile & {
  savedContent: string
}

export type ProposalReviewFile = {
  relativePath: string
  absolutePath: string
  action: 'create' | 'update'
  explanation: string
  originalContent: string
  modifiedContent: string
  pendingBlocks: number | null
  keptBlocks: number
  undoneBlocks: number
}

export type ProposalReview = {
  proposalId: string
  files: ProposalReviewFile[]
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
  proposalReview: ProposalReview | null
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
  beginProposalReview: (proposal: CodeProposal, rootPath: string, platform: string) => void
  openProposalFile: (relativePath: string) => void
  updateProposalReviewFile: (relativePath: string, update: Partial<Pick<ProposalReviewFile, 'originalContent' | 'modifiedContent' | 'pendingBlocks' | 'keptBlocks' | 'undoneBlocks'>>) => void
  discardProposalReview: () => void
  completeProposalReview: (changedPaths: string[]) => void
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
  proposalReview: null,
  setWorkspace: (workspace) =>
    set((state) => {
      const changedWorkspace = state.workspace?.rootPath !== workspace.rootPath
      return {
        workspace,
        documents: changedWorkspace ? [] : state.documents,
        activePath: changedWorkspace ? null : state.activePath,
        revealLine: changedWorkspace ? null : state.revealLine,
        proposalReview: changedWorkspace ? null : state.proposalReview,
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
  setPassingScore: (passingScore) => set({ passingScore }),
  beginProposalReview: (proposal, rootPath, platform) => set((state) => {
    const files = proposal.changes.map((change) => ({
      relativePath: change.relativePath,
      absolutePath: resolveProposalPath(rootPath, change.relativePath, platform),
      action: change.action,
      explanation: change.explanation,
      originalContent: change.originalContent ?? '',
      modifiedContent: change.content,
      pendingBlocks: null,
      keptBlocks: 0,
      undoneBlocks: 0
    }))
    const documents = [...state.documents]
    for (const file of files) {
      if (documents.some((document) => document.path === file.absolutePath)) continue
      documents.push({
        path: file.absolutePath,
        name: file.relativePath.split(/[\\/]/).at(-1) ?? file.relativePath,
        language: languageForPath(file.relativePath),
        content: file.originalContent,
        savedContent: file.originalContent
      })
    }
    return {
      documents,
      activePath: files[0]?.absolutePath ?? state.activePath,
      revealLine: null,
      proposalReview: { proposalId: proposal.id, files }
    }
  }),
  openProposalFile: (relativePath) => set((state) => {
    const file = state.proposalReview?.files.find((candidate) => candidate.relativePath === relativePath)
    if (!file) return state
    const exists = state.documents.some((document) => document.path === file.absolutePath)
    return {
      documents: exists ? state.documents : [...state.documents, {
        path: file.absolutePath,
        name: file.relativePath.split(/[\\/]/).at(-1) ?? file.relativePath,
        language: languageForPath(file.relativePath),
        content: file.originalContent,
        savedContent: file.originalContent
      }],
      activePath: file.absolutePath,
      revealLine: null
    }
  }),
  updateProposalReviewFile: (relativePath, update) => set((state) => ({
    proposalReview: state.proposalReview ? {
      ...state.proposalReview,
      files: state.proposalReview.files.map((file) => file.relativePath === relativePath ? { ...file, ...update } : file)
    } : null
  })),
  discardProposalReview: () => set((state) => {
    if (!state.proposalReview) return state
    const virtualPaths = new Set(state.proposalReview.files.filter((file) => file.action === 'create').map((file) => file.absolutePath))
    const documents = state.documents.filter((document) => !virtualPaths.has(document.path))
    return {
      proposalReview: null,
      documents,
      activePath: state.activePath && virtualPaths.has(state.activePath) ? (documents.at(-1)?.path ?? null) : state.activePath
    }
  }),
  completeProposalReview: (changedPaths) => set((state) => {
    if (!state.proposalReview) return state
    const changed = new Set(changedPaths)
    const reviewFiles = new Map(state.proposalReview.files.map((file) => [file.absolutePath, file]))
    const documents = state.documents
      .filter((document) => {
        const review = reviewFiles.get(document.path)
        return !review || review.action !== 'create' || changed.has(document.path)
      })
      .map((document) => {
        const review = reviewFiles.get(document.path)
        if (!review || !changed.has(document.path)) return document
        return { ...document, content: review.modifiedContent, savedContent: review.modifiedContent }
      })
    return {
      proposalReview: null,
      documents,
      activePath: state.activePath && !documents.some((document) => document.path === state.activePath)
        ? (documents.at(-1)?.path ?? null)
        : state.activePath
    }
  })
}))
