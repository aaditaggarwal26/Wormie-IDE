import Editor, { type BeforeMount } from '@monaco-editor/react'
import { motion } from 'framer-motion'
import { BookOpenCheck, FolderOpen, Save, X } from 'lucide-react'
import { useWorkbench } from '@/store/workbench'

type EditorPaneProps = {
  saving: boolean
  onOpenWorkspace: () => void
  onSave: () => void
}

const configureEditor: BeforeMount = (monaco) => {
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
      'editorIndentGuide.activeBackground1': '#364044'
    }
  })
}

export function EditorPane({ saving, onOpenWorkspace, onSave }: EditorPaneProps): React.JSX.Element {
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const setActivePath = useWorkbench((state) => state.setActivePath)
  const closeDocument = useWorkbench((state) => state.closeDocument)
  const updateDocument = useWorkbench((state) => state.updateDocument)
  const activeDocument = documents.find((document) => document.path === activePath)

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
          <h1>Understand the change.<br /><em>Then</em> write the code.</h1>
          <p>Open a project to start reading and editing. The learning gate will sit between intent and AI-generated changes.</p>
          <button className="welcome-action" onClick={onOpenWorkspace} type="button">
            <FolderOpen size={17} /> Open a project
          </button>
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
            return (
              <button
                className="editor-tab"
                data-active={document.path === activePath}
                key={document.path}
                onClick={() => setActivePath(document.path)}
                type="button"
              >
                <FileCode2Icon />
                <span>{document.name}</span>
                {dirty ? (
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
        <button className="save-button" disabled={saving} onClick={onSave} title="Save file" type="button">
          <Save size={14} />
        </button>
      </div>
      <div className="breadcrumb-bar">
        {activeDocument.path.split(/[\\/]/).slice(-3).map((part, index) => (
          <span key={`${part}-${index}`}>{part}</span>
        ))}
      </div>
      <div className="monaco-wrap">
        <Editor
          beforeMount={configureEditor}
          language={activeDocument.language}
          onChange={(value) => updateDocument(activeDocument.path, value ?? '')}
          options={{
            automaticLayout: true,
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
      </div>
    </main>
  )
}

function FileCode2Icon(): React.JSX.Element {
  return <span className="tab-file-icon">&lt;/&gt;</span>
}

