import { useEffect, useRef } from 'react'
import Editor, { loader, type BeforeMount } from '@monaco-editor/react'
import { motion } from 'framer-motion'
import { BookOpenCheck, FileText, FolderOpen, Save, Sparkles, X } from 'lucide-react'
import * as monaco from 'monaco-editor'
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'
import { useWorkbench } from '@/store/workbench'
import { AgentDiffReview } from '@/components/AgentDiffReview'

const monacoScope = self as typeof self & { MonacoEnvironment: monaco.Environment }

monacoScope.MonacoEnvironment = {
  getWorker(_moduleId: string, label: string) {
    if (label === 'json') return new jsonWorker()
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker()
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker()
    if (label === 'typescript' || label === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

loader.config({ monaco })

type EditorPaneProps = {
  hasWorkspace: boolean
  openingFile: boolean
  saving: boolean
  suggestedFileName: string | null
  onOpenSuggestedFile: () => void
  onOpenWorkspace: () => void
  onSave: () => void
  onCloseDocument: (filePath: string) => void
  onEditorBlur: (filePath: string) => void
}

export const configureEditor: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('wormie-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '66736d', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'e7a96b' },
      { token: 'string', foreground: 'a9c98f' },
      { token: 'number', foreground: 'dfc879' },
      { token: 'type', foreground: '8fb8c9' }
    ],
    colors: {
      'editor.background': '#0d1012',
      'editor.foreground': '#c7cec9',
      'editor.lineHighlightBackground': '#151a1d',
      'editor.selectionBackground': '#314335aa',
      'editorCursor.foreground': '#dce873',
      'editorLineNumber.foreground': '#465057',
      'editorLineNumber.activeForeground': '#9ba59f',
      'editorIndentGuide.background1': '#1e2528',
      'editorIndentGuide.activeBackground1': '#364044',
      'diffEditor.insertedLineBackground': '#24351f88',
      'diffEditor.insertedTextBackground': '#3f632b88',
      'diffEditor.removedLineBackground': '#3a211c88',
      'diffEditor.removedTextBackground': '#6a342888',
      'diffEditor.diagonalFill': '#171c1e',
      'diffEditorGutter.insertedLineBackground': '#2f4b25',
      'diffEditorGutter.removedLineBackground': '#593027'
    }
  })
}

export function EditorPane({
  hasWorkspace,
  openingFile,
  saving,
  suggestedFileName,
  onOpenSuggestedFile,
  onOpenWorkspace,
  onSave,
  onCloseDocument,
  onEditorBlur
}: EditorPaneProps): React.JSX.Element {
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const setActivePath = useWorkbench((state) => state.setActivePath)
  const updateDocument = useWorkbench((state) => state.updateDocument)
  const revealLine = useWorkbench((state) => state.revealLine)
  const consumeRevealLine = useWorkbench((state) => state.consumeRevealLine)
  const setCursorPosition = useWorkbench((state) => state.setCursorPosition)
  const setDocumentView = useWorkbench((state) => state.setDocumentView)
  const proposalReview = useWorkbench((state) => state.proposalReview)
  const openProposalFile = useWorkbench((state) => state.openProposalFile)
  const updateProposalReviewFile = useWorkbench((state) => state.updateProposalReviewFile)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const activeDocument = documents.find((document) => document.path === activePath)
  const activeReviewFile = proposalReview?.files.find((file) => file.absolutePath === activePath)

  useEffect(() => {
    const container = editorContainerRef.current
    if (!container || activeReviewFile) return
    let layoutFrame: number | null = null

    const scheduleLayout = () => {
      if (layoutFrame !== null) return
      layoutFrame = requestAnimationFrame(() => {
        layoutFrame = null
        const width = container.clientWidth
        const height = container.clientHeight
        if (width > 0 && height > 0) editorRef.current?.layout({ width, height })
      })
    }

    const observer = new ResizeObserver(scheduleLayout)
    observer.observe(container)
    scheduleLayout()
    return () => {
      observer.disconnect()
      if (layoutFrame !== null) cancelAnimationFrame(layoutFrame)
    }
  }, [activePath, activeReviewFile])

  useEffect(() => {
    if (!revealLine || !editorRef.current) return
    requestAnimationFrame(() => {
      editorRef.current?.setPosition({ lineNumber: revealLine, column: 1 })
      editorRef.current?.revealLineInCenter(revealLine)
      editorRef.current?.focus()
      consumeRevealLine()
    })
  }, [activePath, consumeRevealLine, revealLine])

  useEffect(() => {
    if (!activePath || activeReviewFile || !editorRef.current) return
    const view = useWorkbench.getState().documents.find((document) => document.path === activePath)?.view
    if (!view) return
    requestAnimationFrame(() => {
      editorRef.current?.setPosition({ lineNumber: view.line, column: view.column })
      editorRef.current?.setScrollPosition({ scrollTop: view.scrollTop, scrollLeft: view.scrollLeft })
    })
  }, [activePath, activeReviewFile])

  if (!activeDocument) {
    return (
      <main className="editor-pane welcome-pane">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="welcome-card"
          initial={{ opacity: 0, y: 14 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="welcome-kicker"><BookOpenCheck size={14} /> Learning workbench</div>
          <h1>
            {hasWorkspace ? <>Pick a file.<br /><em>Start</em> by reading.</> : <>Understand the change.<br /><em>Then</em> write the code.</>}
          </h1>
          <p>
            {hasWorkspace
              ? 'Choose a file from Explorer to open it in the editor. The learning gate will sit between intent and AI-generated changes.'
              : 'Open a project to start reading and editing. The learning gate will sit between intent and AI-generated changes.'}
          </p>
          {hasWorkspace ? (
            <button
              className="welcome-action"
              disabled={!suggestedFileName || openingFile}
              onClick={onOpenSuggestedFile}
              type="button"
            >
              <FileText size={17} />
              {openingFile ? 'Opening...' : suggestedFileName ? `Open ${suggestedFileName}` : 'No text files found'}
            </button>
          ) : (
            <button className="welcome-action" onClick={onOpenWorkspace} type="button">
              <FolderOpen size={17} /> Open a project
            </button>
          )}
          <div className="welcome-sequence" aria-label="Core workflow">
            <span><b>01</b> Learn</span>
            <span><b>02</b> Prove</span>
            <span><b>03</b> Build</span>
          </div>
        </motion.div>
      </main>
    )
  }

  return (
    <main className="editor-pane">
      <div className="editor-tabs">
        <div className="tabs-scroll">
          {documents.map((document) => {
            const dirty = document.content !== document.savedContent
            const reviewFile = proposalReview?.files.find((file) => file.absolutePath === document.path)
            return (
              <button
                className="editor-tab"
                data-active={document.path === activePath}
                data-review={Boolean(reviewFile)}
                key={document.path}
                onClick={() => setActivePath(document.path)}
                type="button"
              >
                <FileCode2Icon />
                <span>{document.name}</span>
                {reviewFile ? (
                  <span className="review-dot" title={reviewFile.pendingBlocks === 0 ? 'AI changes reviewed' : 'AI changes pending review'}><Sparkles size={10} /></span>
                ) : (
                  <span
                    className="tab-close"
                    onClick={(event) => {
                      event.stopPropagation()
                      onCloseDocument(document.path)
                    }}
                    onKeyDown={(event) => {
                      if (event.key !== 'Enter' && event.key !== ' ') return
                      event.preventDefault()
                      event.stopPropagation()
                      onCloseDocument(document.path)
                    }}
                    role="button"
                    tabIndex={0}
                    title={`Close ${document.name}`}
                  >
                    {dirty && <span className="dirty-dot" title="Unsaved changes" />}
                    <X className="tab-close-x" data-dirty={dirty || undefined} size={12} />
                  </span>
                )}
              </button>
            )
          })}
        </div>
        <button className="save-button" disabled={saving || Boolean(activeReviewFile)} onClick={onSave} title={activeReviewFile ? 'Resolve AI changes before saving' : 'Save file'} type="button">
          <Save size={14} />
        </button>
      </div>
      <div className="breadcrumb-bar">
        {activeDocument.path.split(/[\\/]/).slice(-3).map((part, index) => (
          <span key={`${part}-${index}`}>{part}</span>
        ))}
      </div>
      <div className="monaco-wrap" ref={editorContainerRef}>
        {activeReviewFile && proposalReview ? (
          <AgentDiffReview
            beforeMount={configureEditor}
            file={activeReviewFile}
            key={`${proposalReview.proposalId}:${activeReviewFile.relativePath}`}
            onPendingBlocksChange={(pendingBlocks) => {
              updateProposalReviewFile(activeReviewFile.relativePath, { pendingBlocks })
              if (pendingBlocks !== 0) return
              const next = useWorkbench.getState().proposalReview?.files.find((file) =>
                file.relativePath !== activeReviewFile.relativePath && file.pendingBlocks !== 0
              )
              if (next) queueMicrotask(() => openProposalFile(next.relativePath))
            }}
            onResolveBlock={(update) => updateProposalReviewFile(activeReviewFile.relativePath, update)}
            proposalId={proposalReview.proposalId}
          />
        ) : (
          <Editor
            beforeMount={configureEditor}
            language={activeDocument.language}
            onChange={(value) => updateDocument(activeDocument.path, value ?? '')}
            onMount={(mountedEditor) => {
              editorRef.current = mountedEditor
              const container = editorContainerRef.current
              if (container?.clientWidth && container.clientHeight) {
                mountedEditor.layout({ width: container.clientWidth, height: container.clientHeight })
              }
              const restoredView = useWorkbench.getState().documents.find((document) => document.path === useWorkbench.getState().activePath)?.view
              if (restoredView) {
                mountedEditor.setPosition({ lineNumber: restoredView.line, column: restoredView.column })
                mountedEditor.setScrollPosition({ scrollTop: restoredView.scrollTop, scrollLeft: restoredView.scrollLeft })
              }
              mountedEditor.onDidDispose(() => {
                if (editorRef.current === mountedEditor) editorRef.current = null
              })
              mountedEditor.onDidChangeCursorPosition(({ position }) => {
                setCursorPosition(position.lineNumber, position.column)
              })
              mountedEditor.onDidScrollChange(({ scrollTop, scrollLeft }) => {
                const filePath = useWorkbench.getState().activePath
                if (filePath) setDocumentView(filePath, { scrollTop, scrollLeft })
              })
              mountedEditor.onDidBlurEditorText(() => {
                const filePath = useWorkbench.getState().activePath
                if (filePath) onEditorBlur(filePath)
              })
            }}
            options={{
              automaticLayout: false,
              bracketPairColorization: { enabled: true },
              cursorBlinking: 'smooth',
              cursorSmoothCaretAnimation: 'on',
              fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
              fontLigatures: true,
              fontSize: 13,
              lineHeight: 21,
              minimap: { enabled: true, scale: 0.8 },
              padding: { top: 14 },
              renderLineHighlight: 'all',
              scrollBeyondLastLine: false,
              smoothScrolling: true
            }}
            path={activeDocument.path}
            theme="wormie-dark"
            value={activeDocument.content}
          />
        )}
      </div>
    </main>
  )
}

function FileCode2Icon(): React.JSX.Element {
  return <span className="tab-file-icon">&lt;/&gt;</span>
}
