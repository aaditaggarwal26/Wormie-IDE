import { useCallback, useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import { Plus, SplitSquareVertical, TerminalSquare, Trash2 } from 'lucide-react'
import { shouldHandleTerminalCopy, shouldHandleTerminalPaste } from '@/components/terminalShortcuts'
import '@xterm/xterm/css/xterm.css'

type TerminalPaneProps = {
  active: boolean
  workspaceRoot: string | null
}

type TerminalStatus = 'starting' | 'running' | 'exited'

type TerminalPaneState = {
  id: string
  name: string
  status: TerminalStatus
}

type TerminalGroup = {
  id: string
  number: number
  activePaneId: string
  panes: TerminalPaneState[]
}

type TerminalLayout = {
  groups: TerminalGroup[]
  activeGroupId: string | null
  nextNumber: number
}

const maxTerminalSessions = 16
const maxSplitPanes = 4

function createPane(): TerminalPaneState {
  return { id: crypto.randomUUID(), name: 'shell', status: 'starting' }
}

function createGroup(number: number): TerminalGroup {
  const pane = createPane()
  return { id: crypto.randomUUID(), number, activePaneId: pane.id, panes: [pane] }
}

function initialLayout(): TerminalLayout {
  const group = createGroup(1)
  return { groups: [group], activeGroupId: group.id, nextNumber: 2 }
}

function sessionCount(layout: TerminalLayout): number {
  return layout.groups.reduce((total, group) => total + group.panes.length, 0)
}

export function TerminalPane({ active, workspaceRoot }: TerminalPaneProps): React.JSX.Element {
  const [layout, setLayout] = useState<TerminalLayout>(initialLayout)
  const workspaceRef = useRef(workspaceRoot)
  const activeGroup = layout.groups.find((group) => group.id === layout.activeGroupId) ?? null
  const activePane = activeGroup?.panes.find((pane) => pane.id === activeGroup.activePaneId) ?? null

  useEffect(() => {
    if (workspaceRef.current === workspaceRoot) return
    workspaceRef.current = workspaceRoot
    setLayout(initialLayout())
  }, [workspaceRoot])

  const newTerminal = useCallback(() => {
    setLayout((current) => {
      if (sessionCount(current) >= maxTerminalSessions) return current
      const group = createGroup(current.nextNumber)
      return {
        groups: [...current.groups, group],
        activeGroupId: group.id,
        nextNumber: current.nextNumber + 1
      }
    })
  }, [])

  const splitTerminal = useCallback(() => {
    setLayout((current) => {
      const group = current.groups.find((candidate) => candidate.id === current.activeGroupId)
      if (!group || group.panes.length >= maxSplitPanes || sessionCount(current) >= maxTerminalSessions) return current
      const pane = createPane()
      return {
        ...current,
        groups: current.groups.map((candidate) => candidate.id === group.id
          ? { ...candidate, panes: [...candidate.panes, pane], activePaneId: pane.id }
          : candidate)
      }
    })
  }, [])

  const closeActiveTerminal = useCallback(() => {
    setLayout((current) => {
      const group = current.groups.find((candidate) => candidate.id === current.activeGroupId)
      if (!group) return current
      if (group.panes.length > 1) {
        const removedIndex = group.panes.findIndex((pane) => pane.id === group.activePaneId)
        const panes = group.panes.filter((pane) => pane.id !== group.activePaneId)
        const nextPane = panes[Math.min(Math.max(removedIndex, 0), panes.length - 1)]
        return {
          ...current,
          groups: current.groups.map((candidate) => candidate.id === group.id
            ? { ...candidate, panes, activePaneId: nextPane.id }
            : candidate)
        }
      }

      const groups = current.groups.filter((candidate) => candidate.id !== group.id)
      return { ...current, groups, activeGroupId: groups[0]?.id ?? null }
    })
  }, [])

  const selectGroup = useCallback((groupId: string) => {
    setLayout((current) => current.activeGroupId === groupId ? current : { ...current, activeGroupId: groupId })
  }, [])

  const selectPane = useCallback((groupId: string, paneId: string) => {
    setLayout((current) => {
      const group = current.groups.find((candidate) => candidate.id === groupId)
      if (current.activeGroupId === groupId && group?.activePaneId === paneId) return current
      return {
        ...current,
        activeGroupId: groupId,
        groups: current.groups.map((candidate) => candidate.id === groupId ? { ...candidate, activePaneId: paneId } : candidate)
      }
    })
  }, [])

  const updatePane = useCallback((groupId: string, paneId: string, update: Partial<Pick<TerminalPaneState, 'name' | 'status'>>) => {
    setLayout((current) => {
      const pane = current.groups.find((group) => group.id === groupId)?.panes.find((candidate) => candidate.id === paneId)
      if (!pane || (update.name === undefined || update.name === pane.name) && (update.status === undefined || update.status === pane.status)) return current
      return {
        ...current,
        groups: current.groups.map((group) => group.id === groupId
          ? { ...group, panes: group.panes.map((candidate) => candidate.id === paneId ? { ...candidate, ...update } : candidate) }
          : group)
      }
    })
  }, [])

  useEffect(() => {
    if (!active) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (!event.ctrlKey || !event.shiftKey || event.altKey || event.metaKey) return
      if (event.code === 'Backquote') {
        event.preventDefault()
        event.stopPropagation()
        newTerminal()
      } else if (event.code === 'Digit5') {
        event.preventDefault()
        event.stopPropagation()
        splitTerminal()
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [active, newTerminal, splitTerminal])

  return (
    <div className="terminal-workbench">
      <div className="terminal-toolbar">
        <div aria-label="Terminal groups" className="terminal-group-tabs" role="tablist">
          {layout.groups.map((group) => {
            const pane = group.panes.find((candidate) => candidate.id === group.activePaneId) ?? group.panes[0]
            return (
              <button
                aria-selected={group.id === layout.activeGroupId}
                data-active={group.id === layout.activeGroupId}
                key={group.id}
                onClick={() => selectGroup(group.id)}
                role="tab"
                type="button"
              >
                <TerminalSquare size={12} />
                <span>{pane?.name === 'shell' ? `Terminal ${group.number}` : pane?.name}</span>
                {group.panes.length > 1 && <b>{group.panes.length}</b>}
              </button>
            )
          })}
        </div>
        <div className="terminal-actions">
          <button aria-label="New terminal" onClick={newTerminal} title="New terminal (Ctrl+Shift+`)" type="button"><Plus size={14} /></button>
          <button aria-label="Split terminal" disabled={!activeGroup || (activeGroup?.panes.length ?? 0) >= maxSplitPanes} onClick={splitTerminal} title="Split terminal (Ctrl+Shift+5)" type="button"><SplitSquareVertical size={14} /></button>
          <button aria-label="Kill terminal" disabled={!activePane} onClick={closeActiveTerminal} title="Kill active terminal" type="button"><Trash2 size={13} /></button>
        </div>
      </div>

      <div className="terminal-groups">
        {layout.groups.length === 0 && (
          <div className="terminal-empty">
            <TerminalSquare size={17} />
            <span>No running terminals</span>
            <button onClick={newTerminal} type="button"><Plus size={12} /> New terminal</button>
          </div>
        )}
        {layout.groups.map((group) => (
          <div
            className="terminal-group"
            data-active={active && group.id === layout.activeGroupId}
            key={group.id}
            style={{ gridTemplateColumns: `repeat(${group.panes.length}, minmax(0, 1fr))` }}
          >
            {group.panes.map((pane) => (
              <div
                className="terminal-session"
                data-selected={pane.id === group.activePaneId}
                data-status={pane.status}
                key={pane.id}
                onMouseDown={() => selectPane(group.id, pane.id)}
              >
                <TerminalSession
                  active={active && group.id === layout.activeGroupId}
                  onActivate={() => selectPane(group.id, pane.id)}
                  onName={(name) => updatePane(group.id, pane.id, { name })}
                  onStatus={(status) => updatePane(group.id, pane.id, { status })}
                  selected={pane.id === group.activePaneId}
                  sessionId={pane.id}
                  workspaceRoot={workspaceRoot}
                />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

type TerminalSessionProps = {
  active: boolean
  selected: boolean
  sessionId: string
  workspaceRoot: string | null
  onActivate: () => void
  onName: (name: string) => void
  onStatus: (status: TerminalStatus) => void
}

function TerminalSession({
  active,
  selected,
  sessionId,
  workspaceRoot,
  onActivate,
  onName,
  onStatus
}: TerminalSessionProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const startedWorkspaceRef = useRef<string | null>(null)
  const activeRef = useRef(active)
  const selectedRef = useRef(selected)
  const onActivateRef = useRef(onActivate)
  const onNameRef = useRef(onName)
  const onStatusRef = useRef(onStatus)

  useEffect(() => {
    activeRef.current = active
    selectedRef.current = selected
    onActivateRef.current = onActivate
    onNameRef.current = onName
    onStatusRef.current = onStatus
  }, [active, onActivate, onName, onStatus, selected])

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
      fontSize: 12,
      lineHeight: 1.4,
      scrollback: 4000,
      theme: {
        background: '#181818',
        foreground: '#d0d4d1',
        cursor: '#79a8d8',
        cursorAccent: '#181818',
        selectionBackground: '#33507055',
        black: '#181818',
        brightBlack: '#858585',
        green: '#75a384',
        brightGreen: '#8fbc9b',
        yellow: '#c5a66f',
        brightYellow: '#d7ba7d',
        cyan: '#75a7ad',
        brightCyan: '#9cc5ca'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)

    const copySelection = () => {
      const selection = terminal.getSelection()
      if (selection) void window.desktop.copyTerminalText(selection).catch(() => undefined)
    }
    const pasteClipboard = () => {
      void window.desktop.readTerminalClipboard()
        .then((text) => {
          if (text) terminal.paste(text)
          terminal.focus()
        })
        .catch(() => undefined)
    }

    terminal.attachCustomKeyEventHandler((event) => {
      const selection = terminal.getSelection()
      if (shouldHandleTerminalCopy(event, window.desktop.platform, selection.length > 0)) {
        event.preventDefault()
        event.stopPropagation()
        copySelection()
        return false
      }
      if (shouldHandleTerminalPaste(event, window.desktop.platform)) {
        event.preventDefault()
        event.stopPropagation()
        pasteClipboard()
        return false
      }
      return true
    })
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    const inputSubscription = terminal.onData((data) => window.desktop.writeTerminal(sessionId, data))
    const resizeSubscription = terminal.onResize(({ cols, rows }) => window.desktop.resizeTerminal(sessionId, cols, rows))
    const removeDataListener = window.desktop.onTerminalData((event) => {
      if (event.sessionId === sessionId) terminal.write(event.data)
    })
    const removeExitListener = window.desktop.onTerminalExit((event) => {
      if (event.sessionId !== sessionId) return
      const code = event.code
      terminal.writeln(`\r\n[Shell exited${code === null ? '' : ` with code ${code}`}]`)
      startedWorkspaceRef.current = null
      onStatusRef.current('exited')
    })

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
      onActivateRef.current()
      if (terminal.hasSelection()) {
        copySelection()
        terminal.clearSelection()
      } else {
        pasteClipboard()
      }
    }
    containerRef.current.addEventListener('contextmenu', onContextMenu)

    let resizeFrame: number | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (!containerRef.current || containerRef.current.clientWidth === 0 || containerRef.current.clientHeight === 0 || resizeFrame !== null) return
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        fitAddon.fit()
      })
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      window.desktop.stopTerminal(sessionId)
      inputSubscription.dispose()
      resizeSubscription.dispose()
      removeDataListener()
      removeExitListener()
      resizeObserver.disconnect()
      if (resizeFrame !== null) cancelAnimationFrame(resizeFrame)
      containerRef.current?.removeEventListener('contextmenu', onContextMenu)
      terminalRef.current = null
      fitAddonRef.current = null
      terminal.dispose()
    }
  }, [sessionId])

  useEffect(() => {
    if (!active || !terminalRef.current || !fitAddonRef.current) return

    const frame = requestAnimationFrame(() => {
      fitAddonRef.current?.fit()
      if (selected) terminalRef.current?.focus()
    })
    if (!workspaceRoot) {
      terminalRef.current.clear()
      terminalRef.current.writeln('Open a workspace to start a terminal.')
      return () => cancelAnimationFrame(frame)
    }
    if (startedWorkspaceRef.current === workspaceRoot) {
      return () => cancelAnimationFrame(frame)
    }

    terminalRef.current.clear()
    startedWorkspaceRef.current = workspaceRoot
    onStatusRef.current('starting')
    void window.desktop.startTerminal({
      sessionId,
      columns: terminalRef.current.cols,
      rows: terminalRef.current.rows
    })
      .then((info) => {
        if (!terminalRef.current) return
        onNameRef.current(info.shellName)
        onStatusRef.current('running')
        if (activeRef.current && selectedRef.current) terminalRef.current.focus()
      })
      .catch((error: unknown) => {
        if (!terminalRef.current) return
        startedWorkspaceRef.current = null
        onStatusRef.current('exited')
        terminalRef.current.writeln(error instanceof Error ? error.message : 'Could not start terminal.')
      })
    return () => cancelAnimationFrame(frame)
  }, [active, selected, sessionId, workspaceRoot])

  return <div aria-label="Integrated terminal" className="terminal-surface" onFocus={onActivate} ref={containerRef} />
}
