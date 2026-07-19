import { useEffect, useRef } from 'react'
import Editor, { loader, type BeforeMount } from '@monaco-editor/react'
import { FileText, FolderOpen, Save, Sparkles, X } from 'lucide-react'
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
}

const configureEditor: BeforeMount = (monaco) => {
  monaco.editor.defineTheme('wormie-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6a9955', fontStyle: 'italic' },
      { token: 'keyword', foreground: 'c586c0' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'number', foreground: 'b5cea8' },
      { token: 'type', foreground: '4ec9b0' }
    ],
    colors: {
      'editor.background': '#1e1e1e',
      'editor.foreground': '#d4d4d4',
      'editor.lineHighlightBackground': '#242424',
      'editor.selectionBackground': '#264f78',
      'editorCursor.foreground': '#79a8d8',
      'editorLineNumber.foreground': '#858585',
      'editorLineNumber.activeForeground': '#c6c6c6',
      'editorIndentGuide.background1': '#303030',
      'editorIndentGuide.activeBackground1': '#505050',
      'diffEditor.insertedLineBackground': '#1f3d2a66',
      'diffEditor.insertedTextBackground': '#37664277',
      'diffEditor.removedLineBackground': '#4b252566',
      'diffEditor.removedTextBackground': '#7a3e3e77',
      'diffEditor.diagonalFill': '#252526',
      'diffEditorGutter.insertedLineBackground': '#315c3b',
      'diffEditorGutter.removedLineBackground': '#6b3838'
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
  onSave
}: EditorPaneProps): React.JSX.Element {
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const setActivePath = useWorkbench((state) => state.setActivePath)
  const closeDocument = useWorkbench((state) => state.closeDocument)
  const updateDocument = useWorkbench((state) => state.updateDocument)
  const revealLine = useWorkbench((state) => state.revealLine)
  const consumeRevealLine = useWorkbench((state) => state.consumeRevealLine)
  const setCursorPosition = useWorkbench((state) => state.setCursorPosition)
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

  if (!activeDocument) {
    return (
      <main className="editor-pane welcome-pane">
        <div className="welcome-card">
          <h1>Wormie</h1>
          <h2>Start</h2>
          {hasWorkspace ? (
            <button
              className="welcome-action"
              disabled={!suggestedFileName || openingFile}
              onClick={onOpenSuggestedFile}
              type="button"
            >
              <FileText size={17} />
              {openingFile ? 'Opening…' : suggestedFileName ? `Open ${suggestedFileName}` : 'No files found'}
            </button>
          ) : (
            <button className="welcome-action" onClick={onOpenWorkspace} type="button">
              <FolderOpen size={17} /> Open folder
            </button>
          )}
        </div>
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
                ) : dirty ? (
                  <span className="dirty-dot" title="Unsaved changes" />
                ) : (
                  <span
                    className="tab-close"
                    onClick={(event) => {
                      event.stopPropagation()
                      closeDocument(document.path)
                    }}
                    role="button"
                    tabIndex={0}
                  ><X size={12} /></span>
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
              mountedEditor.onDidDispose(() => {
                if (editorRef.current === mountedEditor) editorRef.current = null
              })
              mountedEditor.onDidChangeCursorPosition(({ position }) => {
                setCursorPosition(position.lineNumber, position.column)
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
