import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpenText, Command, FolderOpen, Gauge, Search, Settings2 } from 'lucide-react'
import { ActivityRail } from '@/components/ActivityRail'
import { BottomPanel } from '@/components/BottomPanel'
import { EditorPane } from '@/components/EditorPane'
import { Explorer } from '@/components/Explorer'
import { TutorPane } from '@/components/TutorPane'
import { useWorkbench } from '@/store/workbench'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

export default function App(): React.JSX.Element {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const restored = useRef(false)
  const workspace = useWorkbench((state) => state.workspace)
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const activity = useWorkbench((state) => state.activity)
  const setWorkspace = useWorkbench((state) => state.setWorkspace)
  const openDocument = useWorkbench((state) => state.openDocument)
  const markSaved = useWorkbench((state) => state.markSaved)
  const addOutput = useWorkbench((state) => state.addOutput)

  const workspaceMutation = useMutation({
    mutationFn: window.desktop.openWorkspace,
    onSuccess: (result) => {
      if (result) setWorkspace(result)
    },
    onError: (error) => addOutput(`Could not open workspace: ${errorMessage(error)}`)
  })

  const fileMutation = useMutation({
    mutationFn: window.desktop.readFile,
    onSuccess: openDocument,
    onError: (error) => addOutput(`Could not open file: ${errorMessage(error)}`)
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const activeDocument = documents.find((document) => document.path === activePath)
      if (!activeDocument) return null
      await window.desktop.writeFile(activeDocument.path, activeDocument.content)
      return activeDocument.path
    },
    onSuccess: (filePath) => {
      if (filePath) markSaved(filePath)
    },
    onError: (error) => addOutput(`Could not save file: ${errorMessage(error)}`)
  })

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void window.desktop.restoreWorkspace().then((result) => {
      if (result) setWorkspace(result)
    })
  }, [setWorkspace])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const modifier = window.desktop.platform === 'darwin' ? event.metaKey : event.ctrlKey
      if (!modifier) return

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((value) => !value)
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault()
        saveMutation.mutate()
      }
      if (event.key.toLowerCase() === 'o') {
        event.preventDefault()
        workspaceMutation.mutate()
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [saveMutation, workspaceMutation])

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="titlebar-brand"><span>Wormie</span><i>/</i><b>Learn Before You Code</b></div>
        <button className="command-trigger" onClick={() => setCommandPaletteOpen(true)} type="button">
          <Search size={13} />
          <span>Search commands</span>
          <kbd>{window.desktop.platform === 'darwin' ? '⌘' : 'Ctrl'} K</kbd>
        </button>
        <div className="titlebar-workspace">{workspace?.name ?? 'No workspace'}</div>
      </header>

      <div className="workbench">
        <ActivityRail />
        {activity === 'explorer' && (
          <Explorer
            busy={workspaceMutation.isPending}
            onOpenFile={(filePath) => fileMutation.mutate(filePath)}
            onOpenWorkspace={() => workspaceMutation.mutate()}
            workspace={workspace}
          />
        )}
        {activity === 'learning' && <LearningSidebar />}
        {activity === 'settings' && <SettingsSidebar />}

        <div className="center-stack">
          <EditorPane
            onOpenWorkspace={() => workspaceMutation.mutate()}
            onSave={() => saveMutation.mutate()}
            saving={saveMutation.isPending}
          />
          <BottomPanel />
        </div>
        <TutorPane />
      </div>

      <footer className="statusbar">
        <span className="status-mode"><BookOpenText size={12} /> Learning mode</span>
        <span>{documents.length} open {documents.length === 1 ? 'file' : 'files'}</span>
        <span className="status-spacer" />
        <span>UTF-8</span>
        <span>Ln 1, Col 1</span>
      </footer>

      <AnimatePresence>
        {commandPaletteOpen && (
          <motion.div
            animate={{ opacity: 1 }}
            className="command-backdrop"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            onMouseDown={() => setCommandPaletteOpen(false)}
          >
            <motion.div
              animate={{ opacity: 1, scale: 1, y: 0 }}
              className="command-palette"
              exit={{ opacity: 0, scale: 0.98, y: -8 }}
              initial={{ opacity: 0, scale: 0.98, y: -8 }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="command-input"><Command size={16} /><span>Choose a workbench action</span></div>
              <button onClick={() => { setCommandPaletteOpen(false); workspaceMutation.mutate() }} type="button">
                <FolderOpen size={15} /><span>Open folder</span><kbd>Ctrl O</kbd>
              </button>
              <button disabled={!activePath} onClick={() => { setCommandPaletteOpen(false); saveMutation.mutate() }} type="button">
                <Gauge size={15} /><span>Save active file</span><kbd>Ctrl S</kbd>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function LearningSidebar(): React.JSX.Element {
  return (
    <aside className="side-panel info-panel">
      <div className="panel-heading"><span>Knowledge</span><BookOpenText size={15} /></div>
      <div className="knowledge-empty">
        <div className="knowledge-orbit"><span>0%</span></div>
        <h3>Your profile starts here.</h3>
        <p>Mastery will grow as lessons and quizzes are completed.</p>
      </div>
    </aside>
  )
}

function SettingsSidebar(): React.JSX.Element {
  const passingScore = useWorkbench((state) => state.passingScore)
  const setPassingScore = useWorkbench((state) => state.setPassingScore)

  return (
    <aside className="side-panel info-panel">
      <div className="panel-heading"><span>Settings</span><Settings2 size={15} /></div>
      <div className="settings-block">
        <label htmlFor="passing-score"><span>Passing score</span><b>{passingScore}%</b></label>
        <input
          id="passing-score"
          max="100"
          min="60"
          onChange={(event) => setPassingScore(Number(event.target.value))}
          step="5"
          type="range"
          value={passingScore}
        />
        <p>Code generation unlocks after this threshold.</p>
      </div>
    </aside>
  )
}

