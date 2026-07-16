import { useCallback, useRef, useState } from 'react'
import { DiffEditor, type BeforeMount } from '@monaco-editor/react'
import { Check, ChevronDown, ChevronUp, RotateCcw, Sparkles } from 'lucide-react'
import * as monaco from 'monaco-editor'
import { languageForPath, lineChangeRange } from './proposalReviewModel'
import type { ProposalReviewFile } from '@/store/workbench'

type AgentDiffReviewProps = {
  beforeMount: BeforeMount
  file: ProposalReviewFile
  proposalId: string
  onPendingBlocksChange: (count: number) => void
  onResolveBlock: (update: {
    originalContent: string
    modifiedContent: string
    keptBlocks: number
    undoneBlocks: number
  }) => void
}

function revealChange(editor: monaco.editor.IStandaloneDiffEditor, change: monaco.editor.ILineChange): void {
  const lineNumber = Math.max(1, change.modifiedEndLineNumber === 0
    ? change.modifiedStartLineNumber + 1
    : change.modifiedStartLineNumber)
  const modified = editor.getModifiedEditor()
  modified.setPosition({ lineNumber, column: 1 })
  modified.revealLineInCenter(lineNumber)
  modified.focus()
}

export function AgentDiffReview({
  beforeMount,
  file,
  proposalId,
  onPendingBlocksChange,
  onResolveBlock
}: AgentDiffReviewProps): React.JSX.Element {
  const editorRef = useRef<monaco.editor.IStandaloneDiffEditor | null>(null)
  const reportedPending = useRef<number | null>(null)
  const currentIndexRef = useRef(0)
  const [changes, setChanges] = useState<monaco.editor.ILineChange[]>([])
  const [currentIndex, setCurrentIndex] = useState(0)

  const selectIndex = useCallback((index: number) => {
    currentIndexRef.current = index
    setCurrentIndex(index)
  }, [])

  const syncChanges = useCallback(() => {
    const editor = editorRef.current
    if (!editor) return
    const next = editor.getLineChanges() ?? []
    setChanges(next)
    selectIndex(Math.min(currentIndexRef.current, Math.max(0, next.length - 1)))
    if (reportedPending.current !== next.length) {
      reportedPending.current = next.length
      onPendingBlocksChange(next.length)
    }
  }, [onPendingBlocksChange, selectIndex])

  const navigate = useCallback((offset: number) => {
    const editor = editorRef.current
    const available = editor?.getLineChanges() ?? []
    if (!editor || available.length === 0) return
    const nextIndex = (currentIndexRef.current + offset + available.length) % available.length
    selectIndex(nextIndex)
    revealChange(editor, available[nextIndex])
  }, [selectIndex])

  const resolveCurrent = useCallback((decision: 'keep' | 'undo') => {
    const editor = editorRef.current
    const available = editor?.getLineChanges() ?? []
    if (!editor || available.length === 0) return
    const index = Math.min(currentIndexRef.current, available.length - 1)
    const change = available[index]
    const originalModel = editor.getOriginalEditor().getModel()
    const modifiedModel = editor.getModifiedEditor().getModel()
    if (!originalModel || !modifiedModel) return

    const sourceSide = decision === 'keep' ? 'modified' : 'original'
    const targetSide = decision === 'keep' ? 'original' : 'modified'
    const sourceCoordinates = lineChangeRange(change, sourceSide)
    const targetCoordinates = lineChangeRange(change, targetSide)
    const sourceRange = new monaco.Range(
      sourceCoordinates.startLineNumber,
      sourceCoordinates.startColumn,
      sourceCoordinates.endLineNumber,
      sourceCoordinates.endColumn
    )
    const targetRange = new monaco.Range(
      targetCoordinates.startLineNumber,
      targetCoordinates.startColumn,
      targetCoordinates.endLineNumber,
      targetCoordinates.endColumn
    )
    const sourceModel = sourceSide === 'modified' ? modifiedModel : originalModel
    const targetModel = targetSide === 'modified' ? modifiedModel : originalModel
    targetModel.pushEditOperations([], [{ range: targetRange, text: sourceModel.getValueInRange(sourceRange) }], () => null)

    onResolveBlock({
      originalContent: originalModel.getValue(),
      modifiedContent: modifiedModel.getValue(),
      keptBlocks: file.keptBlocks + (decision === 'keep' ? 1 : 0),
      undoneBlocks: file.undoneBlocks + (decision === 'undo' ? 1 : 0)
    })
  }, [file.keptBlocks, file.undoneBlocks, onResolveBlock])

  const modelKey = encodeURIComponent(file.relativePath)
  const complete = changes.length === 0 && file.pendingBlocks === 0

  return (
    <div className="agent-diff-review" data-complete={complete}>
      <div className="diff-review-toolbar" role="toolbar" aria-label="Review AI change blocks">
        <div className="diff-review-title">
          <Sparkles size={13} />
          <span>{complete ? 'File reviewed' : `AI change ${Math.min(currentIndex + 1, changes.length)} of ${changes.length || '…'}`}</span>
          <small>{file.relativePath}</small>
        </div>
        {!complete && (
          <>
            <button aria-label="Previous change block" disabled={changes.length < 2} onClick={() => navigate(-1)} title="Previous change" type="button"><ChevronUp size={14} /></button>
            <button aria-label="Next change block" disabled={changes.length < 2} onClick={() => navigate(1)} title="Next change" type="button"><ChevronDown size={14} /></button>
            <span className="diff-review-separator" />
            <button className="diff-review-undo" disabled={changes.length === 0} onClick={() => resolveCurrent('undo')} title="Restore this block" type="button"><RotateCcw size={13} /> Undo block</button>
            <button className="diff-review-keep" disabled={changes.length === 0} onClick={() => resolveCurrent('keep')} title="Keep this block" type="button"><Check size={13} /> Keep block</button>
          </>
        )}
        {complete && <span className="diff-reviewed-count"><Check size={12} /> {file.keptBlocks} kept · {file.undoneBlocks} undone</span>}
      </div>
      <DiffEditor
        beforeMount={beforeMount}
        key={`${proposalId}:${file.relativePath}`}
        language={languageForPath(file.relativePath)}
        modified={file.modifiedContent}
        modifiedModelPath={`wormie-review://modified/${proposalId}/${modelKey}`}
        onMount={(editor) => {
          editorRef.current = editor
          const modified = editor.getModifiedEditor()
          const disposables = [
            editor.onDidUpdateDiff(() => {
              syncChanges()
              const available = editor.getLineChanges() ?? []
              if (available.length > 0) revealChange(editor, available[Math.min(currentIndexRef.current, available.length - 1)])
            }),
            modified.onDidChangeCursorPosition(({ position }) => {
              const available = editor.getLineChanges() ?? []
              const index = available.findIndex((change) => {
                const start = Math.max(1, change.modifiedStartLineNumber)
                const end = change.modifiedEndLineNumber === 0 ? start : change.modifiedEndLineNumber
                return position.lineNumber >= start && position.lineNumber <= end
              })
              if (index >= 0) selectIndex(index)
            })
          ]
          modified.onDidDispose(() => disposables.forEach((disposable) => disposable.dispose()))
          void editor.revealFirstDiff()
          syncChanges()
        }}
        options={{
          automaticLayout: true,
          bracketPairColorization: { enabled: true },
          diffAlgorithm: 'advanced',
          enableSplitViewResizing: false,
          fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
          fontLigatures: true,
          fontSize: 13,
          hideUnchangedRegions: { enabled: true, contextLineCount: 4, minimumLineCount: 10, revealLineCount: 12 },
          lineHeight: 21,
          minimap: { enabled: false },
          originalEditable: false,
          padding: { top: 54 },
          readOnly: true,
          renderGutterMenu: false,
          renderIndicators: false,
          renderOverviewRuler: true,
          renderSideBySide: false,
          scrollBeyondLastLine: false,
          smoothScrolling: true
        }}
        original={file.originalContent}
        originalModelPath={`wormie-review://original/${proposalId}/${modelKey}`}
        theme="wormie-dark"
      />
    </div>
  )
}
