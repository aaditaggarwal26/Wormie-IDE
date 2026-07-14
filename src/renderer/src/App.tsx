import { useEffect, useMemo, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpenText, Command, FolderOpen, Gauge, Search, Settings2 } from 'lucide-react'
import { ActivityRail } from '@/components/ActivityRail'
import { BottomPanel } from '@/components/BottomPanel'
import { EditorPane } from '@/components/EditorPane'
import { Explorer } from '@/components/Explorer'
import { SearchPanel } from '@/components/SearchPanel'
import { SourceControlPanel } from '@/components/SourceControlPanel'
import { TutorPane } from '@/components/TutorPane'
import { useWorkbench } from '@/store/workbench'
import type { FileTreeNode } from '@shared/contracts'

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'An unexpected error occurred.'
}

function findSuggestedFile(entries: FileTreeNode[]): FileTreeNode | null {
  const textFiles: FileTreeNode[] = []
  const visit = (nodes: FileTreeNode[]) => {
    for (const node of nodes) {
      if (node.type === 'directory') visit(node.children ?? [])
      else if (/\.(md|txt|json|tsx?|jsx?|css|scss|html|ya?ml|toml|py|rs|go|java|sql)$/i.test(node.name)) textFiles.push(node)
    }
  }
  visit(entries)

  const preferredNames = ['readme.md', 'project.md', 'package.json', 'agents.md']
  return preferredNames
    .map((name) => textFiles.find((file) => file.name.toLowerCase() === name))
    .find((file) => file !== undefined) ?? textFiles[0] ?? null
}

export default function App(): React.JSX.Element {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const restored = useRef(false)
  const automaticallyOpenedWorkspace = useRef<string | null>(null)
  const workspace = useWorkbench((state) => state.workspace)
  const documents = useWorkbench((state) => state.documents)
  const activePath = useWorkbench((state) => state.activePath)
  const activity = useWorkbench((state) => state.activity)
  const cursorLine = useWorkbench((state) => state.cursorLine)
  const cursorColumn = useWorkbench((state) => state.cursorColumn)
  const setWorkspace = useWorkbench((state) => state.setWorkspace)
  const openDocument = useWorkbench((state) => state.openDocument)
  const markSaved = useWorkbench((state) => state.markSaved)
  const moveDocuments = useWorkbench((state) => state.moveDocuments)
  const removeDocuments = useWorkbench((state) => state.removeDocuments)
  const setActivity = useWorkbench((state) => state.setActivity)
  const setBottomView = useWorkbench((state) => state.setBottomView)
  const addOutput = useWorkbench((state) => state.addOutput)

  const workspaceMutation = useMutation({
    mutationFn: window.desktop.openWorkspace,
    onSuccess: (result) => {
      if (result) setWorkspace(result)
    },
    onError: (error) => addOutput(`Could not open workspace: ${errorMessage(error)}`)
  })

  const fileMutation = useMutation({
    mutationFn: ({ filePath }: { filePath: string; line?: number }) => window.desktop.readFile(filePath),
    onSuccess: (file, variables) => openDocument(file, variables.line),
    onError: (error) => addOutput(`Could not open file: ${errorMessage(error)}`)
  })

  const refreshMutation = useMutation({
    mutationFn: window.desktop.refreshWorkspace,
    onSuccess: setWorkspace,
    onError: (error) => addOutput(`Could not refresh workspace: ${errorMessage(error)}`)
  })

  const createMutation = useMutation({
    mutationFn: ({ parentPath, name, type }: { parentPath: string; name: string; type: 'file' | 'directory' }) =>
      window.desktop.createEntry(parentPath, name, type),
    onSuccess: (result, variables) => {
      setWorkspace(result.workspace)
      if (variables.type === 'file') fileMutation.mutate({ filePath: result.path })
    },
    onError: (error) => addOutput(`Could not create entry: ${errorMessage(error)}`)
  })

  const renameMutation = useMutation({
    mutationFn: ({ entryPath, name }: { entryPath: string; name: string }) => window.desktop.renameEntry(entryPath, name),
    onSuccess: (result) => {
      setWorkspace(result.workspace)
      if (result.previousPath) moveDocuments(result.previousPath, result.path)
    },
    onError: (error) => addOutput(`Could not rename entry: ${errorMessage(error)}`)
  })

  const deleteMutation = useMutation({
    mutationFn: window.desktop.deleteEntry,
    onSuccess: (result) => {
      if (!result) return
      setWorkspace(result.workspace)
      removeDocuments(result.path)
    },
    onError: (error) => addOutput(`Could not delete entry: ${errorMessage(error)}`)
  })

  const searchMutation = useMutation({
    mutationFn: window.desktop.searchWorkspace,
    onError: (error) => addOutput(`Could not search workspace: ${errorMessage(error)}`)
  })

  const gitMutation = useMutation({
    mutationFn: window.desktop.getGitStatus,
    onError: (error) => addOutput(`Could not read Git status: ${errorMessage(error)}`)
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
    if (activity === 'sourceControl' && workspace) gitMutation.mutate()
  }, [activity, workspace?.rootPath])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      const modifier = window.desktop.platform === 'darwin' ? event.metaKey : event.ctrlKey
      if (!modifier) return

      if (event.key.toLowerCase() === 'k') {
        event.preventDefault()
        setCommandPaletteOpen((value) => !value)
      }
      if (event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        setActivity('search')
      }
      if (event.key === '`') {
        event.preventDefault()
        setBottomView('terminal')
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
  }, [saveMutation, setActivity, setBottomView, workspaceMutation])

  const explorerBusy =
    workspaceMutation.isPending ||
    refreshMutation.isPending ||
    createMutation.isPending ||
    renameMutation.isPending ||
    deleteMutation.isPending

  const suggestedFile = useMemo(
    () => workspace ? findSuggestedFile(workspace.entries) : null,
    [workspace]
  )

  useEffect(() => {
    if (!workspace || documents.length > 0 || automaticallyOpenedWorkspace.current === workspace.rootPath) return
    automaticallyOpenedWorkspace.current = workspace.rootPath
    const initialFile = findSuggestedFile(workspace.entries)
    if (initialFile) fileMutation.mutate({ filePath: initialFile.path })
  }, [workspace?.rootPath])

  return (
    <div className="app-shell">
      <header className="titlebar">
        <div className="titlebar-brand"><span>Wormie</span><i>/</i><b>Learn Before You Code</b></div>
        <button className="command-trigger" onClick={() => setCommandPaletteOpen(true)} type="button">
          <Search size={13} />
          <span>Search commands</span>
          <kbd>{window.desktop.platform === 'darwin' ? 'Cmd' : 'Ctrl'} K</kbd>
        </button>
        <div className="titlebar-workspace">{workspace?.name ?? 'No workspace'}</div>
      </header>

      <div className="workbench">
        <ActivityRail />
        {activity === 'explorer' && (
          <Explorer
            busy={explorerBusy}
            onCreate={(parentPath, name, type) => createMutation.mutate({ parentPath, name, type })}
            onDelete={(entryPath) => deleteMutation.mutate(entryPath)}
            onOpenFile={(filePath) => fileMutation.mutate({ filePath })}
            onOpenWorkspace={() => workspaceMutation.mutate()}
            onRefresh={() => refreshMutation.mutate()}
            onRename={(entryPath, name) => renameMutation.mutate({ entryPath, name })}
            workspace={workspace}
          />
        )}
        {activity === 'search' && (
          <SearchPanel
            busy={searchMutation.isPending}
            onOpenFile={(filePath, line) => fileMutation.mutate({ filePath, line })}
            onSearch={(query) => searchMutation.mutate(query)}
            results={searchMutation.data ?? []}
            workspace={workspace}
          />
        )}
        {activity === 'sourceControl' && (
          <SourceControlPanel
            busy={gitMutation.isPending}
            onOpenFile={(filePath) => fileMutation.mutate({ filePath })}
            onRefresh={() => gitMutation.mutate()}
            status={gitMutation.data ?? null}
            workspace={workspace}
          />
        )}
        {activity === 'learning' && <LearningSidebar />}
        {activity === 'settings' && <SettingsSidebar />}

        <div className="center-stack">
          <EditorPane
            hasWorkspace={Boolean(workspace)}
            onOpenSuggestedFile={() => suggestedFile && fileMutation.mutate({ filePath: suggestedFile.path })}
            onOpenWorkspace={() => workspaceMutation.mutate()}
            onSave={() => saveMutation.mutate()}
            openingFile={fileMutation.isPending}
            saving={saveMutation.isPending}
            suggestedFileName={suggestedFile?.name ?? null}
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
        <span>Ln {cursorLine}, Col {cursorColumn}</span>
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
              <button disabled={!workspace} onClick={() => { setCommandPaletteOpen(false); setActivity('search') }} type="button">
                <Search size={15} /><span>Search project</span><kbd>Ctrl Shift F</kbd>
              </button>
              <button disabled={!workspace} onClick={() => { setCommandPaletteOpen(false); setBottomView('terminal') }} type="button">
                <Command size={15} /><span>Focus terminal</span><kbd>Ctrl `</kbd>
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
