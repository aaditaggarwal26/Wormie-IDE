import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'framer-motion'
import { BookOpenText, Command, FolderOpen, Gauge, GraduationCap, Search, Settings2 } from 'lucide-react'
import { ActivityRail } from '@/components/ActivityRail'
import { AuthScreen } from '@/components/AuthScreen'
import { AssignmentPanel } from '@/components/AssignmentPanel'
import { AssignmentStudio } from '@/components/AssignmentStudio'
import { BottomPanel } from '@/components/BottomPanel'
import { ClassroomPanel } from '@/components/ClassroomPanel'
import { EditorPane } from '@/components/EditorPane'
import { Explorer } from '@/components/Explorer'
import { PanelResizeHandle } from '@/components/PanelResizeHandle'
import { SearchPanel } from '@/components/SearchPanel'
import { SourceControlPanel } from '@/components/SourceControlPanel'
import { TutorPane } from '@/components/TutorPane'
import { QuizHistory } from '@/components/QuizHistory'
import { UnderstandingSettings } from '@/components/UnderstandingSettings'
import { useWorkbench } from '@/store/workbench'
import type {
  AgentConfig,
  AgentProvider,
  AssignmentManifestDraft,
  AssignmentEvidencePolicy,
  AssignmentSaveRequest,
  AssignmentSubmission,
  AssignmentTask,
  AssignmentTaskProgressUpdate,
  AssignmentWorkspaceState,
  Classroom,
  CloudAuthCredentials,
  CloudAuthState,
  CodexAccountStatus,
  FileTreeNode
} from '@shared/contracts'

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.'
  return message
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/i, '')
    .replace(/^Error:\s*/i, '')
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

type PanelLayout = {
  left: number
  right: number
  bottom: number
}

const PANEL_LAYOUT_STORAGE_KEY = 'wormie.panel-layout.v1'
const PANEL_HANDLE_SIZE = 5
const ACTIVITY_RAIL_WIDTH = 50
const CENTER_MIN_WIDTH = 360
const EDITOR_MIN_HEIGHT = 140
const PANEL_LIMITS = {
  left: { min: 180, max: 480, initial: 238 },
  right: { min: 260, max: 600, initial: 330 },
  bottom: { min: 110, max: 520, initial: 210 }
} as const

function clampPanelSize(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function loadPanelLayout(): PanelLayout {
  const fallback = {
    left: PANEL_LIMITS.left.initial,
    right: PANEL_LIMITS.right.initial,
    bottom: PANEL_LIMITS.bottom.initial
  }
  try {
    const raw = window.localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY)
    if (!raw) return fallback
    const stored = JSON.parse(raw) as Partial<Record<keyof PanelLayout, unknown>>
    const readSize = (key: keyof PanelLayout) => {
      const value = stored[key]
      const limit = PANEL_LIMITS[key]
      return typeof value === 'number' && Number.isFinite(value)
        ? clampPanelSize(value, limit.min, limit.max)
        : fallback[key]
    }
    return { left: readSize('left'), right: readSize('right'), bottom: readSize('bottom') }
  } catch {
    return fallback
  }
}

export default function App(): React.JSX.Element {
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false)
  const [assignmentStudioOpen, setAssignmentStudioOpen] = useState(false)
  const [assignmentRecovering, setAssignmentRecovering] = useState(false)
  const [assignmentState, setAssignmentState] = useState<AssignmentWorkspaceState | null>(null)
  const [assignmentError, setAssignmentError] = useState<string | null>(null)
  const [assignmentProgressError, setAssignmentProgressError] = useState<string | null>(null)
  const [reviewedSubmission, setReviewedSubmission] = useState<AssignmentSubmission | null>(null)
  const [assignmentLoading, setAssignmentLoading] = useState(false)
  const [cloudAuth, setCloudAuth] = useState<CloudAuthState | null>(null)
  const [cloudAuthLoaded, setCloudAuthLoaded] = useState(false)
  const [cloudError, setCloudError] = useState<string | null>(null)
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const [gitError, setGitError] = useState<string | null>(null)
  const [classrooms, setClassrooms] = useState<Classroom[]>([])
  const [classroomActionVersion, setClassroomActionVersion] = useState(0)
  const [pendingClassroomInvite, setPendingClassroomInvite] = useState<string | null>(null)
  const [panelLayout, setPanelLayout] = useState<PanelLayout>(loadPanelLayout)
  const restored = useRef(false)
  const assignmentLoadSequence = useRef(0)
  const assignmentEditorRevision = useRef<string | null>(null)
  const assignmentReturnFocus = useRef<HTMLElement | null>(null)
  const assignmentOpenLoad = useRef(false)
  const automaticallyOpenedWorkspace = useRef<string | null>(null)
  const workbenchRef = useRef<HTMLDivElement | null>(null)
  const centerStackRef = useRef<HTMLDivElement | null>(null)
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

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_LAYOUT_STORAGE_KEY, JSON.stringify(panelLayout))
    } catch {
      // The layout remains usable for this session when storage is unavailable.
    }
  }, [panelLayout])

  useEffect(() => {
    if (!cloudAuthLoaded || !cloudAuth?.user) return
    const workbench = workbenchRef.current
    const centerStack = centerStackRef.current
    if (!workbench || !centerStack) return

    const constrainLayout = () => {
      setPanelLayout((current) => {
        const availableSideWidth = Math.max(
          PANEL_LIMITS.left.min + PANEL_LIMITS.right.min,
          workbench.clientWidth - ACTIVITY_RAIL_WIDTH - (PANEL_HANDLE_SIZE * 2) - CENTER_MIN_WIDTH
        )
        let left = clampPanelSize(current.left, PANEL_LIMITS.left.min, PANEL_LIMITS.left.max)
        let right = clampPanelSize(current.right, PANEL_LIMITS.right.min, PANEL_LIMITS.right.max)
        let overflow = left + right - availableSideWidth
        if (overflow > 0) {
          const rightReduction = Math.min(overflow, right - PANEL_LIMITS.right.min)
          right -= rightReduction
          overflow -= rightReduction
          left -= Math.min(overflow, left - PANEL_LIMITS.left.min)
        }
        const bottomMax = Math.max(
          PANEL_LIMITS.bottom.min,
          Math.min(PANEL_LIMITS.bottom.max, centerStack.clientHeight - PANEL_HANDLE_SIZE - EDITOR_MIN_HEIGHT)
        )
        const bottom = clampPanelSize(current.bottom, PANEL_LIMITS.bottom.min, bottomMax)
        return left === current.left && right === current.right && bottom === current.bottom
          ? current
          : { left, right, bottom }
      })
    }

    constrainLayout()
    const observer = new ResizeObserver(constrainLayout)
    observer.observe(workbench)
    observer.observe(centerStack)
    return () => observer.disconnect()
  }, [cloudAuth?.user?.id, cloudAuthLoaded])

  const resizeLeftPanel = useCallback((delta: number) => {
    setPanelLayout((current) => {
      const available = (workbenchRef.current?.clientWidth ?? window.innerWidth)
        - ACTIVITY_RAIL_WIDTH - (PANEL_HANDLE_SIZE * 2) - current.right - CENTER_MIN_WIDTH
      const max = Math.max(PANEL_LIMITS.left.min, Math.min(PANEL_LIMITS.left.max, available))
      const left = clampPanelSize(current.left + delta, PANEL_LIMITS.left.min, max)
      return left === current.left ? current : { ...current, left }
    })
  }, [])

  const resizeRightPanel = useCallback((delta: number) => {
    setPanelLayout((current) => {
      const available = (workbenchRef.current?.clientWidth ?? window.innerWidth)
        - ACTIVITY_RAIL_WIDTH - (PANEL_HANDLE_SIZE * 2) - current.left - CENTER_MIN_WIDTH
      const max = Math.max(PANEL_LIMITS.right.min, Math.min(PANEL_LIMITS.right.max, available))
      const right = clampPanelSize(current.right - delta, PANEL_LIMITS.right.min, max)
      return right === current.right ? current : { ...current, right }
    })
  }, [])

  const resizeBottomPanel = useCallback((delta: number) => {
    setPanelLayout((current) => {
      const available = (centerStackRef.current?.clientHeight ?? window.innerHeight)
        - PANEL_HANDLE_SIZE - EDITOR_MIN_HEIGHT
      const max = Math.max(PANEL_LIMITS.bottom.min, Math.min(PANEL_LIMITS.bottom.max, available))
      const bottom = clampPanelSize(current.bottom - delta, PANEL_LIMITS.bottom.min, max)
      return bottom === current.bottom ? current : { ...current, bottom }
    })
  }, [])

  const loadAssignment = useCallback(async (workspaceRoot: string) => {
    const sequence = ++assignmentLoadSequence.current
    setAssignmentLoading(true)
    try {
      const result = await window.desktop.getAssignment(workspaceRoot)
      if (sequence !== assignmentLoadSequence.current || result.workspaceRoot !== workspaceRoot || useWorkbench.getState().workspace?.rootPath !== workspaceRoot) return null
      setAssignmentState(result)
      setAssignmentError(result.error ?? null)
      setAssignmentProgressError(result.progressError ?? null)
      return result
    } catch (error) {
      if (sequence !== assignmentLoadSequence.current || useWorkbench.getState().workspace?.rootPath !== workspaceRoot) return null
      setAssignmentState(null)
      setAssignmentError(errorMessage(error))
      return null
    } finally {
      if (sequence === assignmentLoadSequence.current && useWorkbench.getState().workspace?.rootPath === workspaceRoot) setAssignmentLoading(false)
    }
  }, [])

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
    mutationFn: async (workspaceRoot: string) => {
      const result = await window.desktop.refreshWorkspace()
      return { result, workspaceRoot }
    },
    onSuccess: ({ result, workspaceRoot }) => {
      if (useWorkbench.getState().workspace?.rootPath !== workspaceRoot || result.rootPath !== workspaceRoot) return
      setWorkspace(result)
      void loadAssignment(result.rootPath)
    },
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
    onMutate: () => setGitError(null),
    onSuccess: () => setGitError(null),
    onError: (error) => {
      const message = errorMessage(error)
      setGitError(message)
      addOutput(`Could not read Git status: ${message}`)
    }
  })

  const gitTrustMutation = useMutation({
    mutationFn: window.desktop.trustGitRepository,
    onSuccess: () => {
      setGitError(null)
      gitMutation.mutate()
    },
    onError: (error) => {
      const message = errorMessage(error)
      setGitError(message)
      addOutput(`Could not trust Git repository: ${message}`)
    }
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      const state = useWorkbench.getState()
      const activeDocument = state.documents.find((document) => document.path === state.activePath)
      if (!activeDocument) return null
      if (state.proposalReview?.files.some((file) => file.absolutePath === activeDocument.path)) {
        throw new Error('Keep or undo every AI change block before saving this file.')
      }
      await window.desktop.writeFile(activeDocument.path, activeDocument.content)
      return activeDocument.path
    },
    onSuccess: (filePath) => {
      if (!filePath) return
      markSaved(filePath)
      if (filePath === assignmentState?.manifestPath && workspace) void loadAssignment(workspace.rootPath)
    },
    onError: (error) => addOutput(`Could not save file: ${errorMessage(error)}`)
  })

  const saveAssignmentMutation = useMutation({
    mutationFn: ({ request }: { request: AssignmentSaveRequest; workspaceRoot: string }) => window.desktop.saveAssignment(request),
    onSuccess: (result, variables) => {
      if (useWorkbench.getState().workspace?.rootPath !== variables.workspaceRoot) return
      setAssignmentState(result)
      setAssignmentError(null)
      setAssignmentStudioOpen(false)
      setAssignmentRecovering(false)
      addOutput(`Saved assignment ${result.manifest?.title ?? ''}.`)
      refreshMutation.mutate(variables.workspaceRoot)
    },
    onError: (error) => setAssignmentError(errorMessage(error))
  })

  const revealAssignmentMutation = useMutation({
    mutationFn: window.desktop.revealAssignment,
    onError: (error) => addOutput(`Could not reveal assignment manifest: ${errorMessage(error)}`)
  })

  const exportAssignmentMutation = useMutation({
    mutationFn: window.desktop.exportAssignment,
    onSuccess: (result) => {
      if (result) addOutput(`Exported ${result.fileCount} starter files to ${result.filePath}.`)
    },
    onError: (error) => addOutput(`Could not export assignment package: ${errorMessage(error)}`)
  })

  const importAssignmentMutation = useMutation({
    mutationFn: window.desktop.importAssignment,
    onSuccess: (result) => {
      if (!result) return
      setWorkspace(result.workspace)
      setActivity('assignments')
      addOutput(`Imported ${result.assignmentTitle} with ${result.fileCount} starter files.`)
    },
    onError: (error) => addOutput(`Could not import assignment package: ${errorMessage(error)}`)
  })

  const startAssignmentMutation = useMutation({
    mutationFn: window.desktop.startAssignment,
    onSuccess: (progress, request) => {
      setAssignmentState((current) => current?.workspaceRoot === request.workspaceRoot && current.revision === request.assignmentRevision ? { ...current, progress } : current)
      setAssignmentProgressError(null)
    },
    onError: (error) => setAssignmentProgressError(errorMessage(error))
  })

  const updateTaskMutation = useMutation({
    mutationFn: window.desktop.updateAssignmentTask,
    onSuccess: (progress, request) => {
      setAssignmentState((current) => current?.workspaceRoot === request.workspaceRoot && current.revision === request.assignmentRevision ? { ...current, progress } : current)
      setAssignmentProgressError(null)
    },
    onError: (error) => setAssignmentProgressError(errorMessage(error))
  })

  const submitAssignmentMutation = useMutation({
    mutationFn: window.desktop.submitAssignment,
    onSuccess: (result, request) => {
      if (!result) return
      setAssignmentState((current) => current?.workspaceRoot === request.workspaceRoot ? { ...current, progress: result.submission.progress } : current)
      setAssignmentProgressError(null)
      addOutput(`Saved submission to ${result.filePath}.`)
    },
    onError: (error) => setAssignmentProgressError(errorMessage(error))
  })

  const openSubmissionMutation = useMutation({
    mutationFn: window.desktop.openAssignmentSubmission,
    onSuccess: (submission) => {
      if (submission) setReviewedSubmission(submission)
    },
    onError: (error) => addOutput(`Could not open submission: ${errorMessage(error)}`)
  })

  const authMutation = useMutation({
    mutationFn: ({ mode, credentials }: { mode: 'sign-in' | 'sign-up'; credentials: CloudAuthCredentials }) =>
      mode === 'sign-in' ? window.desktop.signIn(credentials) : window.desktop.signUp(credentials),
    onSuccess: (result) => {
      setCloudAuth(result)
      setCloudError(null)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const googleAuthMutation = useMutation({
    mutationFn: window.desktop.signInWithGoogle,
    onMutate: () => setCloudError(null),
    onError: (error) => setCloudError(errorMessage(error))
  })

  const passwordResetMutation = useMutation({
    mutationFn: window.desktop.requestPasswordReset,
    onSuccess: () => {
      setCloudError(null)
      setResetEmailSent(true)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const updatePasswordMutation = useMutation({
    mutationFn: window.desktop.updatePassword,
    onSuccess: (result) => {
      setCloudAuth(result)
      setCloudError(null)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const classroomListMutation = useMutation({
    mutationFn: window.desktop.listClassrooms,
    onSuccess: (result) => {
      setClassrooms(result)
      setCloudError(null)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const createClassroomMutation = useMutation({
    mutationFn: window.desktop.createClassroom,
    onSuccess: (result) => {
      setClassrooms(result)
      setClassroomActionVersion((version) => version + 1)
      setCloudError(null)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const joinClassroomMutation = useMutation({
    mutationFn: window.desktop.joinClassroom,
    onSuccess: (result) => {
      setClassrooms(result)
      setClassroomActionVersion((version) => version + 1)
      setCloudError(null)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const rotateInviteMutation = useMutation({
    mutationFn: window.desktop.rotateClassroomInvite,
    onSuccess: (result) => {
      setClassrooms(result)
      setCloudError(null)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const publishAssignmentMutation = useMutation({
    mutationFn: window.desktop.publishAssignment,
    onSuccess: (result) => {
      setClassrooms(result)
      setCloudError(null)
      addOutput('Published the assignment to the classroom.')
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const openClassroomAssignmentMutation = useMutation({
    mutationFn: window.desktop.openClassroomAssignment,
    onSuccess: (result) => {
      if (!result) return
      setWorkspace(result.workspace)
      setActivity('assignments')
      addOutput(`Opened classroom assignment ${result.assignmentTitle}.`)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const signOutMutation = useMutation({
    mutationFn: window.desktop.signOut,
    onSuccess: () => {
      setCloudAuth({ user: null })
      setClassrooms([])
      setCloudError(null)
    },
    onError: (error) => setCloudError(errorMessage(error))
  })

  const openAssignmentStudio = useCallback((recovering = false) => {
    if (!workspace) return
    assignmentReturnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (recovering) {
      assignmentEditorRevision.current = assignmentState?.revision ?? null
      setAssignmentRecovering(true)
      setAssignmentStudioOpen(true)
      return
    }
    const workspaceRoot = workspace.rootPath
    if (activity !== 'assignments') assignmentOpenLoad.current = true
    void loadAssignment(workspaceRoot).then((result) => {
      if (!result || useWorkbench.getState().workspace?.rootPath !== workspaceRoot) return
      assignmentEditorRevision.current = result.revision
      setAssignmentRecovering(Boolean(result.error))
      setAssignmentStudioOpen(true)
    })
  }, [activity, assignmentState?.revision, loadAssignment, workspace])

  const reloadAssignmentStudio = useCallback(() => {
    if (!workspace || !window.confirm('Reload the assignment from disk and discard this draft?')) return
    const workspaceRoot = workspace.rootPath
    setAssignmentStudioOpen(false)
    void loadAssignment(workspaceRoot).then((result) => {
      if (!result || useWorkbench.getState().workspace?.rootPath !== workspaceRoot) return
      assignmentEditorRevision.current = result.revision
      setAssignmentRecovering(Boolean(result.error))
      setAssignmentStudioOpen(true)
    })
  }, [loadAssignment, workspace])

  useEffect(() => {
    return window.desktop.onCloudAuthChanged((update) => {
      if (update.auth) setCloudAuth(update.auth)
      setCloudError(update.error)
      setCloudAuthLoaded(true)
    })
  }, [])

  useEffect(() => {
    let active = true
    void window.desktop.getCloudAuth()
      .then((result) => {
        if (!active) return
        setCloudAuth(result)
        setCloudError(null)
      })
      .catch((error) => {
        if (!active) return
        setCloudAuth({ user: null })
        setCloudError(errorMessage(error))
      })
      .finally(() => {
        if (active) setCloudAuthLoaded(true)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    const removeListener = window.desktop.onClassroomInvite(setPendingClassroomInvite)
    void window.desktop.getPendingClassroomInvite()
      .then((inviteLink) => {
        if (inviteLink) setPendingClassroomInvite(inviteLink)
      })
      .catch((error) => setCloudError(errorMessage(error)))
    return removeListener
  }, [])

  useEffect(() => {
    if (!cloudAuth?.user || !pendingClassroomInvite || joinClassroomMutation.isPending) return
    const inviteLink = pendingClassroomInvite
    setPendingClassroomInvite(null)
    setActivity('classrooms')
    joinClassroomMutation.mutate(inviteLink)
  }, [cloudAuth?.user?.id, pendingClassroomInvite, joinClassroomMutation.isPending, setActivity])

  useEffect(() => {
    if (cloudAuth?.user) classroomListMutation.mutate()
  }, [cloudAuth?.user?.id])

  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void window.desktop.restoreWorkspace().then((result) => {
      if (result) setWorkspace(result)
    })
  }, [setWorkspace])

  useEffect(() => {
    setAssignmentState(null)
    setAssignmentError(null)
    setAssignmentProgressError(null)
    setReviewedSubmission(null)
    setAssignmentStudioOpen(false)
    if (!workspace) return

    void loadAssignment(workspace.rootPath)
  }, [loadAssignment, workspace?.rootPath])

  useEffect(() => {
    if (activity === 'sourceControl' && workspace) gitMutation.mutate()
    if (activity === 'classrooms' && cloudAuth?.user) classroomListMutation.mutate()
    if (activity === 'assignments' && workspace) {
      if (assignmentOpenLoad.current) assignmentOpenLoad.current = false
      else void loadAssignment(workspace.rootPath)
    }
  }, [activity, workspace?.rootPath])

  useEffect(() => {
    const refreshOnFocus = () => {
      const current = useWorkbench.getState().workspace
      if (current && useWorkbench.getState().activity === 'assignments' && !assignmentStudioOpen) {
        void loadAssignment(current.rootPath)
      }
    }
    window.addEventListener('focus', refreshOnFocus)
    return () => window.removeEventListener('focus', refreshOnFocus)
  }, [assignmentStudioOpen, loadAssignment])

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if (assignmentStudioOpen) return
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
  }, [assignmentStudioOpen, saveMutation, setActivity, setBottomView, workspaceMutation])

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

  const classroomBusy =
    classroomListMutation.isPending ||
    createClassroomMutation.isPending ||
    joinClassroomMutation.isPending ||
    rotateInviteMutation.isPending ||
    publishAssignmentMutation.isPending ||
    openClassroomAssignmentMutation.isPending ||
    signOutMutation.isPending

  if (!cloudAuthLoaded || !cloudAuth?.user || cloudAuth.passwordResetRequired) {
    return <AuthScreen
      busy={authMutation.isPending || googleAuthMutation.isPending || passwordResetMutation.isPending || updatePasswordMutation.isPending}
      confirmationRequired={Boolean(cloudAuth?.emailConfirmationRequired)}
      error={cloudError}
      googleBusy={googleAuthMutation.isPending}
      loading={!cloudAuthLoaded}
      onGoogleSignIn={() => googleAuthMutation.mutate()}
      onRequestPasswordReset={(email) => passwordResetMutation.mutate(email)}
      onSubmit={(mode, credentials) => authMutation.mutate({ mode, credentials })}
      onUpdatePassword={(password) => updatePasswordMutation.mutate(password)}
      passwordResetRequired={Boolean(cloudAuth?.passwordResetRequired)}
      resetEmailSent={resetEmailSent}
    />
  }

  return (
    <div className="app-shell" data-platform={window.desktop.platform}>
      <header className="titlebar" inert={assignmentStudioOpen ? true : undefined}>
        <div className="titlebar-brand"><span>Wormie</span></div>
        <button className="command-trigger" onClick={() => setCommandPaletteOpen(true)} type="button">
          <Search size={13} />
          <span>Search commands</span>
          <kbd>{window.desktop.platform === 'darwin' ? 'Cmd' : 'Ctrl'} K</kbd>
        </button>
        <div className="titlebar-workspace">{workspace?.name ?? 'No workspace'}</div>
      </header>

      <div
        className="workbench"
        inert={assignmentStudioOpen ? true : undefined}
        ref={workbenchRef}
        style={{
          '--left-panel-width': `${panelLayout.left}px`,
          '--right-panel-width': `${panelLayout.right}px`
        } as CSSProperties}
      >
        <ActivityRail />
        {activity === 'explorer' && (
          <Explorer
            busy={explorerBusy}
            onCreate={(parentPath, name, type) => createMutation.mutate({ parentPath, name, type })}
            onDelete={(entryPath) => deleteMutation.mutate(entryPath)}
            onOpenFile={(filePath) => fileMutation.mutate({ filePath })}
            onOpenWorkspace={() => workspaceMutation.mutate()}
            onRefresh={() => workspace && refreshMutation.mutate(workspace.rootPath)}
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
            busy={gitMutation.isPending || gitTrustMutation.isPending}
            error={gitError}
            onOpenFile={(filePath) => fileMutation.mutate({ filePath })}
            onRefresh={() => gitMutation.mutate()}
            onTrustRepository={(repositoryRoot) => gitTrustMutation.mutate(repositoryRoot)}
            status={workspace && gitMutation.data?.workspaceRoot === workspace.rootPath ? gitMutation.data : null}
            trustingRoot={gitTrustMutation.isPending ? gitTrustMutation.variables : null}
            workspace={workspace}
          />
        )}
        {activity === 'classrooms' && (
          <ClassroomPanel
            actionVersion={classroomActionVersion}
            assignment={assignmentState}
            busy={classroomBusy}
            classrooms={classrooms}
            error={cloudError}
            onCopyInvite={(inviteLink) => {
              void window.desktop.copyClassroomInvite(inviteLink)
                .then(() => addOutput('Copied the classroom invitation.'))
                .catch((error) => setCloudError(errorMessage(error)))
            }}
            onCreate={(request) => createClassroomMutation.mutate(request)}
            onJoin={(invite) => joinClassroomMutation.mutate(invite)}
            onOpenAssignment={(assignmentId) => openClassroomAssignmentMutation.mutate(assignmentId)}
            onPublish={(classroomId) => {
              if (!workspace) return
              publishAssignmentMutation.mutate({ classroomId, workspaceRoot: workspace.rootPath })
            }}
            onRefresh={() => classroomListMutation.mutate()}
            onRotateInvite={(classroomId) => rotateInviteMutation.mutate(classroomId)}
            onSignOut={() => signOutMutation.mutate()}
            user={cloudAuth.user}
            workspace={workspace}
          />
        )}
        {activity === 'assignments' && (
          <AssignmentPanel
            assignment={assignmentState}
            busy={assignmentLoading}
            error={assignmentError}
            progressError={assignmentProgressError}
            exporting={exportAssignmentMutation.isPending}
            importing={importAssignmentMutation.isPending}
            openingSubmission={openSubmissionMutation.isPending}
            onEdit={() => openAssignmentStudio(false)}
            onExport={() => exportAssignmentMutation.mutate()}
            onImport={() => importAssignmentMutation.mutate()}
            onOpenTask={(task) => {
              if (!workspace) return
              const separator = window.desktop.platform === 'win32' ? '\\' : '/'
              const segments = task.filePath.split('/')
              const filePath = `${workspace.rootPath}${separator}${segments.join(separator)}`
              if (task.kind !== 'create') {
                fileMutation.mutate({ filePath })
                return
              }
              void window.desktop.readFile(filePath).then((file) => openDocument(file)).catch(async () => {
                const parentPath = `${workspace.rootPath}${separator}${segments.slice(0, -1).join(separator)}`
                try {
                  const created = await window.desktop.createEntry(parentPath, segments.at(-1)!, 'file')
                  if (useWorkbench.getState().workspace?.rootPath !== workspace.rootPath) return
                  setWorkspace(created.workspace)
                  fileMutation.mutate({ filePath: created.path })
                } catch (error) {
                  addOutput(`Could not create task file: ${errorMessage(error)}`)
                }
              })
            }}
            onOpenSubmission={() => workspace && openSubmissionMutation.mutate(workspace.rootPath)}
            onRecover={() => openAssignmentStudio(true)}
            onReveal={() => revealAssignmentMutation.mutate()}
            onStart={(name: string, evidenceConsent: AssignmentEvidencePolicy) => {
              if (!workspace || !assignmentState?.manifest || !assignmentState.revision) return
              startAssignmentMutation.mutate({
                workspaceRoot: workspace.rootPath,
                assignmentId: assignmentState.manifest.id,
                assignmentRevision: assignmentState.revision,
                studentName: name,
                evidenceConsent
              })
            }}
            onUpdateTask={(update: AssignmentTaskProgressUpdate) => {
              if (!workspace || !assignmentState?.manifest || !assignmentState.revision || !assignmentState.progress) return
              updateTaskMutation.mutate({
                workspaceRoot: workspace.rootPath,
                assignmentId: assignmentState.manifest.id,
                assignmentRevision: assignmentState.revision,
                expectedProgressRevision: assignmentState.progress.revision,
                update
              })
            }}
            onSubmit={() => {
              if (!workspace || !assignmentState?.manifest || !assignmentState.revision || !assignmentState.progress) return
              submitAssignmentMutation.mutate({
                workspaceRoot: workspace.rootPath,
                assignmentId: assignmentState.manifest.id,
                assignmentRevision: assignmentState.revision,
                expectedProgressRevision: assignmentState.progress.revision
              })
            }}
            progressBusy={startAssignmentMutation.isPending || updateTaskMutation.isPending || submitAssignmentMutation.isPending}
            reviewedSubmission={reviewedSubmission}
            submitting={submitAssignmentMutation.isPending}
            workspace={workspace}
          />
        )}
        {activity === 'learning' && <LearningSidebar />}
        {activity === 'settings' && <SettingsSidebar />}

        <PanelResizeHandle
          ariaLabel="Resize primary sidebar"
          max={PANEL_LIMITS.left.max}
          min={PANEL_LIMITS.left.min}
          onReset={() => setPanelLayout((current) => ({ ...current, left: PANEL_LIMITS.left.initial }))}
          onResize={resizeLeftPanel}
          orientation="vertical"
          value={panelLayout.left}
        />

        <div
          className="center-stack"
          ref={centerStackRef}
          style={{ '--bottom-panel-height': `${panelLayout.bottom}px` } as CSSProperties}
        >
          <EditorPane
            hasWorkspace={Boolean(workspace)}
            onOpenSuggestedFile={() => suggestedFile && fileMutation.mutate({ filePath: suggestedFile.path })}
            onOpenWorkspace={() => workspaceMutation.mutate()}
            onSave={() => saveMutation.mutate()}
            openingFile={fileMutation.isPending}
            saving={saveMutation.isPending}
            suggestedFileName={suggestedFile?.name ?? null}
          />
          <PanelResizeHandle
            ariaLabel="Resize bottom panel"
            max={PANEL_LIMITS.bottom.max}
            min={PANEL_LIMITS.bottom.min}
            onReset={() => setPanelLayout((current) => ({ ...current, bottom: PANEL_LIMITS.bottom.initial }))}
            onResize={resizeBottomPanel}
            orientation="horizontal"
            value={panelLayout.bottom}
          />
          <BottomPanel />
        </div>
        <PanelResizeHandle
          ariaLabel="Resize AI tutor sidebar"
          max={PANEL_LIMITS.right.max}
          min={PANEL_LIMITS.right.min}
          onReset={() => setPanelLayout((current) => ({ ...current, right: PANEL_LIMITS.right.initial }))}
          onResize={resizeRightPanel}
          orientation="vertical"
          value={panelLayout.right}
        />
        <TutorPane />
      </div>

      <footer className="statusbar" inert={assignmentStudioOpen ? true : undefined}>
        <span className="status-mode"><BookOpenText size={12} /> Learning mode</span>
        <span className="status-open-files">{documents.length} open {documents.length === 1 ? 'file' : 'files'}</span>
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
              <button disabled={!workspace} onClick={() => { setCommandPaletteOpen(false); setActivity('assignments'); openAssignmentStudio(false) }} type="button">
                <BookOpenText size={15} /><span>{assignmentState?.manifest ? 'Edit assignment' : 'Create assignment'}</span>
              </button>
              <button onClick={() => { setCommandPaletteOpen(false); setActivity('classrooms') }} type="button">
                <GraduationCap size={15} /><span>Open classrooms</span>
              </button>
              <button onClick={() => { setCommandPaletteOpen(false); importAssignmentMutation.mutate() }} type="button">
                <FolderOpen size={15} /><span>Import assignment package</span>
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {assignmentStudioOpen && workspace && (
          <AssignmentStudio
            error={assignmentError}
            manifest={assignmentState?.manifest ?? null}
            onClearError={() => {
              if (!assignmentError?.includes('outside this editor')) setAssignmentError(null)
            }}
            onClose={() => { setAssignmentStudioOpen(false); setAssignmentRecovering(false); setAssignmentError(null) }}
            onSave={(draft: AssignmentManifestDraft) => saveAssignmentMutation.mutate({
              request: { workspaceRoot: workspace.rootPath, draft, expectedRevision: assignmentEditorRevision.current, replaceInvalid: assignmentRecovering },
              workspaceRoot: workspace.rootPath
            })}
            onReload={reloadAssignmentStudio}
            recovering={assignmentRecovering}
            returnFocus={assignmentReturnFocus.current}
            saving={saveAssignmentMutation.isPending}
            workspace={workspace}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

function LearningSidebar(): React.JSX.Element {
  return (
    <aside className="side-panel info-panel">
      <div className="panel-heading"><span>Knowledge</span><BookOpenText size={15} /></div>
      <QuizHistory compact />
    </aside>
  )
}

function SettingsSidebar(): React.JSX.Element {
  const passingScore = useWorkbench((state) => state.passingScore)
  const setPassingScore = useWorkbench((state) => state.setPassingScore)
  const addOutput = useWorkbench((state) => state.addOutput)
  const [provider, setProvider] = useState<AgentProvider>('openai-compatible')
  const [model, setModel] = useState('gpt-5.4-mini')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [savedConfig, setSavedConfig] = useState<AgentConfig | null>(null)
  const [codexAccount, setCodexAccount] = useState<CodexAccountStatus | null>(null)

  const loadCodexAccount = useCallback(() => window.desktop.getCodexAccount().then((status) => {
    setCodexAccount(status)
    return status
  }), [])

  useEffect(() => {
    void window.desktop.getAgentConfig()
      .then((config) => {
        setSavedConfig(config)
        setProvider(config.provider)
        setModel(config.model)
        setBaseUrl(config.baseUrl)
        setPassingScore(config.passingScore)
        if (config.provider === 'codex-account') {
          void loadCodexAccount().catch((error) => addOutput(`Could not check Codex account: ${errorMessage(error)}`))
        }
      })
      .catch((error) => addOutput(`Could not load AI settings: ${errorMessage(error)}`))
  }, [addOutput, loadCodexAccount, setPassingScore])

  const codexStatusMutation = useMutation({
    mutationFn: loadCodexAccount,
    onError: (error) => addOutput(`Could not check Codex account: ${errorMessage(error)}`)
  })

  const connectCodexMutation = useMutation({
    mutationFn: window.desktop.connectCodexAccount,
    onSuccess: (status) => {
      setCodexAccount(status)
      addOutput(`Connected Codex account${status.email ? ` for ${status.email}` : ''}.`)
    },
    onError: (error) => addOutput(`Could not connect Codex account: ${errorMessage(error)}`)
  })

  const saveAgentMutation = useMutation({
    mutationFn: () => window.desktop.saveAgentConfig({ provider, model, baseUrl, apiKey: apiKey || undefined }),
    onSuccess: (config) => {
      setSavedConfig(config)
      setApiKey('')
      addOutput('Saved AI provider settings.')
    },
    onError: (error) => addOutput(`Could not save AI settings: ${errorMessage(error)}`)
  })

  const clearKeyMutation = useMutation({
    mutationFn: () => window.desktop.saveAgentConfig({ provider, model, baseUrl, clearApiKey: true }),
    onSuccess: (config) => {
      setSavedConfig(config)
      setApiKey('')
      addOutput('Removed the stored AI API key.')
    },
    onError: (error) => addOutput(`Could not remove AI key: ${errorMessage(error)}`)
  })

  const codexReady = codexAccount?.connected === true && codexAccount.authMode === 'chatgpt'
  const connectionLabel = provider === 'codex-account'
    ? codexReady ? 'Connected' : codexAccount?.available === false ? 'Unavailable' : 'Sign in required'
    : savedConfig?.hasApiKey ? 'Connected' : 'Key required'

  const selectProvider = (nextProvider: AgentProvider) => {
    setProvider(nextProvider)
    if (nextProvider === 'codex-account') {
      if (provider !== 'codex-account') setModel('')
      codexStatusMutation.mutate()
    } else if (!model.trim()) {
      setModel('gpt-5.4-mini')
    }
  }

  return (
    <aside className="side-panel info-panel">
      <div className="panel-heading"><span>Settings</span><Settings2 size={15} /></div>
      <div className="settings-block">
        <label htmlFor="passing-score"><span>Passing score</span><b>{passingScore}%</b></label>
        <input
          id="passing-score"
          max="100"
          min="60"
          onChange={(event) => {
            const score = Number(event.target.value)
            setPassingScore(score)
            void window.desktop.setAgentPassingScore(score).catch((error) => addOutput(`Could not save passing score: ${errorMessage(error)}`))
          }}
          step="5"
          type="range"
          value={passingScore}
        />
        <p>Code generation unlocks after this threshold.</p>
      </div>
      <div className="settings-block ai-settings">
        <div className="settings-title"><span>AI provider</span><b>{connectionLabel}</b></div>
        <label className="field-label" htmlFor="ai-provider">Connection</label>
        <select id="ai-provider" onChange={(event) => selectProvider(event.target.value as AgentProvider)} value={provider}>
          <option value="openai-compatible">OpenAI-compatible API</option>
          <option value="codex-account">ChatGPT / Codex account</option>
        </select>
        {provider === 'codex-account' ? (
          <>
            <div className="codex-account-card" data-connected={codexReady}>
              <span className="codex-account-dot" />
              <div>
                <b>{codexReady ? codexAccount.email ?? 'ChatGPT account connected' : 'Connect your ChatGPT account'}</b>
                <small>{codexReady
                  ? `${codexAccount.planType ?? 'ChatGPT'} plan · Codex usage`
                  : codexAccount?.error ?? 'A secure browser window will open for official Codex sign-in.'}</small>
              </div>
            </div>
            <label className="field-label" htmlFor="ai-model">Model override · optional</label>
            <input
              id="ai-model"
              onChange={(event) => setModel(event.target.value)}
              placeholder="Use the Codex default"
              spellCheck={false}
              type="text"
              value={model}
            />
            <div className="settings-actions">
              <button
                disabled={connectCodexMutation.isPending || codexStatusMutation.isPending || codexReady}
                onClick={() => connectCodexMutation.mutate()}
                type="button"
              >
                {connectCodexMutation.isPending ? 'Waiting for sign-in…' : codexReady ? 'Account connected' : 'Connect ChatGPT'}
              </button>
              <button
                disabled={saveAgentMutation.isPending || !codexReady}
                onClick={() => saveAgentMutation.mutate()}
                type="button"
              >Use Codex</button>
            </div>
            <button
              className="settings-link-button"
              disabled={codexStatusMutation.isPending}
              onClick={() => codexStatusMutation.mutate()}
              type="button"
            >Refresh account status</button>
            <p>Uses your ChatGPT plan's Codex allowance through the official bundled runtime. It does not turn your ChatGPT login into an API key.</p>
            <p>Wormie runs Codex in an isolated, read-only profile with tools, browsing, MCP, and shell access disabled.</p>
          </>
        ) : (
          <>
            <label className="field-label" htmlFor="ai-model">Model ID</label>
            <input id="ai-model" onChange={(event) => setModel(event.target.value)} spellCheck={false} type="text" value={model} />
            <label className="field-label" htmlFor="ai-base-url">Base URL</label>
            <input id="ai-base-url" onChange={(event) => setBaseUrl(event.target.value)} spellCheck={false} type="url" value={baseUrl} />
            <label className="field-label" htmlFor="ai-key">API key</label>
            <input
              autoComplete="off"
              id="ai-key"
              onChange={(event) => setApiKey(event.target.value)}
              placeholder={savedConfig?.hasApiKey ? 'Stored securely · enter to replace' : 'Paste a provider key'}
              spellCheck={false}
              type="password"
              value={apiKey}
            />
            <div className="settings-actions">
              <button disabled={saveAgentMutation.isPending || !model.trim() || !baseUrl.trim()} onClick={() => saveAgentMutation.mutate()} type="button">Save provider</button>
              {savedConfig?.hasApiKey && <button disabled={clearKeyMutation.isPending} onClick={() => clearKeyMutation.mutate()} type="button">Remove key</button>}
            </div>
            <p>
              Keys never enter the renderer. {savedConfig?.keyStorage === 'session'
                ? 'Secure OS storage is unavailable, so this key lasts only until the app closes.'
                : 'When available, the OS credential encryption service protects the stored key.'}
            </p>
            <p>Custom providers must expose an OpenAI-compatible <code>/chat/completions</code> API. Local HTTP is allowed only on loopback.</p>
          </>
        )}
      </div>
      <UnderstandingSettings />
    </aside>
  )
}
