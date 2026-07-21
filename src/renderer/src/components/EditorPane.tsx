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
import { SafeRenameDialog } from '@/components/SafeRenameDialog'
import { useTypeScriptProject } from '@/typescript/useTypeScriptProject'
import { useSafeRename } from '@/typescript/useSafeRename'
import { fileUriToPath, isWorkspaceFilePath, workspacePathToFileUri } from '@/typescript/fileUri'
import { CODE_FONT_STACKS, editorTheme, shouldReduceMotion, useAppearance } from '@/store/appearance'

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
let languageFeaturesConfigured = false

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
  onOpenFile: (filePath: string, line: number) => void
}

export const configureEditor: BeforeMount = (monaco) => {
  if (!languageFeaturesConfigured) {
    languageFeaturesConfigured = true
    const compilerOptions: monaco.languages.typescript.CompilerOptions = {
      allowJs: true,
      allowNonTsExtensions: true,
      allowSyntheticDefaultImports: true,
      esModuleInterop: true,
      jsx: monaco.languages.typescript.JsxEmit.ReactJSX,
      module: monaco.languages.typescript.ModuleKind.ESNext,
      moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
      noEmit: true,
      resolveJsonModule: true,
      target: monaco.languages.typescript.ScriptTarget.ESNext
    }
    const inlayHints: monaco.languages.typescript.InlayHintsOptions = {
      includeInlayEnumMemberValueHints: true,
      includeInlayFunctionLikeReturnTypeHints: true,
      includeInlayParameterNameHints: 'literals',
      includeInlayParameterNameHintsWhenArgumentMatchesName: false,
      includeInlayVariableTypeHints: false
    }
    for (const defaults of [monaco.languages.typescript.typescriptDefaults, monaco.languages.typescript.javascriptDefaults]) {
      defaults.setCompilerOptions(compilerOptions)
      defaults.setDiagnosticsOptions({ noSemanticValidation: false, noSyntaxValidation: false, noSuggestionDiagnostics: false, onlyVisible: false })
      defaults.setEagerModelSync(true)
      defaults.setInlayHintsOptions(inlayHints)
    }
    for (const language of ['typescript', 'javascript']) {
      monaco.languages.registerRenameProvider(language, {
        provideRenameEdits: () => ({ edits: [], rejectReason: 'Use Wormie Safe Rename (F2) to preview workspace edits.' }),
        resolveRenameLocation: (model, position) => {
          const word = model.getWordAtPosition(position)
          return {
            range: word ? new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn) : new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
            text: word?.word ?? '',
            rejectReason: 'Use Wormie Safe Rename (F2) to preview workspace edits.'
          }
        }
      })
    }
  }
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
  monaco.editor.defineTheme('wormie-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '477b3a', fontStyle: 'italic' },
      { token: 'keyword', foreground: '7f3b8f' },
      { token: 'string', foreground: 'a31515' },
      { token: 'number', foreground: '098658' },
      { token: 'type', foreground: '267f99' }
    ],
    colors: {
      'editor.background': '#ffffff',
      'editor.foreground': '#202124',
      'editor.lineHighlightBackground': '#f4f6f8',
      'editor.selectionBackground': '#add6ff',
      'editorCursor.foreground': '#1769aa',
      'editorLineNumber.foreground': '#6e7781',
      'editorLineNumber.activeForeground': '#1f2328',
      'editorIndentGuide.background1': '#d8dee4',
      'editorIndentGuide.activeBackground1': '#a9b4bf',
      'diffEditor.insertedLineBackground': '#dff3e566',
      'diffEditor.insertedTextBackground': '#a8ddb877',
      'diffEditor.removedLineBackground': '#fce3df66',
      'diffEditor.removedTextBackground': '#efb4ac77',
      'diffEditor.diagonalFill': '#eef1f3',
      'diffEditorGutter.insertedLineBackground': '#4b9460',
      'diffEditorGutter.removedLineBackground': '#c75b50'
    }
  })
  monaco.editor.defineTheme('wormie-hc-dark', {
    base: 'hc-black',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#000000', 'editorCursor.foreground': '#ffffff', 'editor.selectionBackground': '#155b8f' }
  })
  monaco.editor.defineTheme('wormie-hc-light', {
    base: 'hc-light',
    inherit: true,
    rules: [],
    colors: { 'editor.background': '#ffffff', 'editorCursor.foreground': '#000000', 'editor.selectionBackground': '#8cc8ff' }
  })
  const accessiblePalettes = {
    'red-green': { inserted: '0072b244', insertedText: '56b4e966', insertedGutter: '0072b2', removed: 'cc79a744', removedText: 'df9ac066', removedGutter: 'a94c7e' },
    'blue-yellow': { inserted: '18897744', insertedText: '4cab9d66', insertedGutter: '188977', removed: 'a64d7944', removedText: 'c2759d66', removedGutter: '8f3d67' },
    monochrome: { inserted: '8a8a8a44', insertedText: 'b0b0b066', insertedGutter: 'd0d0d0', removed: '4a4a4a66', removedText: '70707077', removedGutter: '777777' }
  } as const
  for (const [name, palette] of Object.entries(accessiblePalettes)) {
    const diffColors = {
      'diffEditor.insertedLineBackground': `#${palette.inserted}`,
      'diffEditor.insertedTextBackground': `#${palette.insertedText}`,
      'diffEditor.removedLineBackground': `#${palette.removed}`,
      'diffEditor.removedTextBackground': `#${palette.removedText}`,
      'diffEditorGutter.insertedLineBackground': `#${palette.insertedGutter}`,
      'diffEditorGutter.removedLineBackground': `#${palette.removedGutter}`
    }
    monaco.editor.defineTheme(`wormie-dark-${name}`, { base: 'vs-dark', inherit: true, rules: [], colors: { 'editor.background': '#1e1e1e', ...diffColors } })
    monaco.editor.defineTheme(`wormie-light-${name}`, { base: 'vs', inherit: true, rules: [], colors: { 'editor.background': '#ffffff', ...diffColors } })
    monaco.editor.defineTheme(`wormie-hc-dark-${name}`, { base: 'hc-black', inherit: true, rules: [], colors: diffColors })
    monaco.editor.defineTheme(`wormie-hc-light-${name}`, { base: 'hc-light', inherit: true, rules: [], colors: diffColors })
  }
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
  onEditorBlur,
  onOpenFile
}: EditorPaneProps): React.JSX.Element {
  useTypeScriptProject()
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
  const appearance = useAppearance((state) => state.preferences)
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null)
  const editorContainerRef = useRef<HTMLDivElement | null>(null)
  const safeRename = useSafeRename(editorRef)
  const activeDocument = documents.find((document) => document.path === activePath)
  const activeReviewFile = proposalReview?.files.find((file) => file.absolutePath === activePath)

  useEffect(() => {
    const rename = () => { void safeRename.begin() }
    const runAction = (event: Event) => {
      const actionId = (event as CustomEvent<string>).detail
      if (actionId) void editorRef.current?.getAction(actionId)?.run()
    }
    window.addEventListener('wormie:rename-symbol', rename)
    window.addEventListener('wormie:editor-action', runAction)
    return () => {
      window.removeEventListener('wormie:rename-symbol', rename)
      window.removeEventListener('wormie:editor-action', runAction)
    }
  }, [safeRename.begin])

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
              {openingFile ? 'Opening...' : suggestedFileName ? `Open ${suggestedFileName}` : 'No files found'}
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
              const opener = monaco.editor.registerEditorOpener({
                openCodeEditor: (_source, resource, selectionOrPosition) => {
                  const workspaceRoot = useWorkbench.getState().workspace?.rootPath
                  if (!workspaceRoot || resource.scheme !== 'file') return false
                  const filePath = fileUriToPath(resource.toString(), window.desktop.platform)
                  if (!isWorkspaceFilePath(workspaceRoot, filePath, window.desktop.platform)) return false
                  const line = selectionOrPosition
                    ? ('startLineNumber' in selectionOrPosition ? selectionOrPosition.startLineNumber : selectionOrPosition.lineNumber)
                    : 1
                  onOpenFile(filePath, line)
                  return true
                }
              })
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
                opener.dispose()
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
              cursorSmoothCaretAnimation: shouldReduceMotion(appearance) ? 'off' : 'on',
              fontFamily: CODE_FONT_STACKS[appearance.codeFont],
              fontLigatures: appearance.fontLigatures,
              fontSize: appearance.editorFontSize,
              inlayHints: { enabled: 'on' },
              lineHeight: Math.round(appearance.editorFontSize * appearance.editorLineHeight),
              minimap: { enabled: true, scale: 0.8 },
              padding: { top: 14 },
              renderLineHighlight: 'all',
              'semanticHighlighting.enabled': true,
              scrollBeyondLastLine: false,
              smoothScrolling: !shouldReduceMotion(appearance)
            }}
            path={workspacePathToFileUri(activeDocument.path, window.desktop.platform)}
            theme={editorTheme(appearance)}
            value={activeDocument.content}
          />
        )}
      </div>
      {safeRename.state && (
        <SafeRenameDialog
          onApply={() => void safeRename.apply()}
          onClose={safeRename.close}
          onPreview={(newName) => void safeRename.preview(newName)}
          onSetNewName={safeRename.setNewName}
          onToggleFile={safeRename.toggleFile}
          state={safeRename.state}
        />
      )}
    </main>
  )
}

function FileCode2Icon(): React.JSX.Element {
  return <span className="tab-file-icon">&lt;/&gt;</span>
}
