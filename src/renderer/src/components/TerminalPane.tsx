import { useEffect, useRef } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'

type TerminalPaneProps = {
  active: boolean
  workspaceRoot: string | null
}

export function TerminalPane({ active, workspaceRoot }: TerminalPaneProps): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  const terminalRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const startedWorkspaceRef = useRef<string | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const terminal = new Terminal({
      allowTransparency: true,
      convertEol: true,
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: "'Cascadia Code', 'SFMono-Regular', Consolas, monospace",
      fontSize: 11,
      lineHeight: 1.35,
      scrollback: 4000,
      theme: {
        background: '#0b0e10',
        foreground: '#b7c0bb',
        cursor: '#dce873',
        selectionBackground: '#3a4c3d',
        black: '#111719',
        brightBlack: '#59656a',
        green: '#96bd83',
        brightGreen: '#dce873',
        yellow: '#d4b16f',
        brightYellow: '#e7a96b',
        cyan: '#86adb6',
        brightCyan: '#a8ccd3'
      }
    })
    const fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(containerRef.current)
    terminalRef.current = terminal
    fitAddonRef.current = fitAddon

    let inputBuffer = ''
    const commandHistory: string[] = []
    let historyIndex = 0

    const replaceInput = (nextInput: string) => {
      for (let index = 0; index < inputBuffer.length; index += 1) terminal.write('\b \b')
      inputBuffer = nextInput
      terminal.write(inputBuffer)
    }

    const submitInput = () => {
      terminal.write('\r\n')
      window.desktop.writeTerminal(`${inputBuffer}\r`)
      if (inputBuffer.trim() && commandHistory.at(-1) !== inputBuffer) commandHistory.push(inputBuffer)
      historyIndex = commandHistory.length
      inputBuffer = ''
    }

    const inputSubscription = terminal.onData((data) => {
      if (data === '\u001b[A') {
        if (historyIndex > 0) {
          historyIndex -= 1
          replaceInput(commandHistory[historyIndex] ?? '')
        }
        return
      }
      if (data === '\u001b[B') {
        if (historyIndex < commandHistory.length) historyIndex += 1
        replaceInput(commandHistory[historyIndex] ?? '')
        return
      }
      if (data.startsWith('\u001b')) return

      for (let index = 0; index < data.length; index += 1) {
        const character = data[index]
        if (character === '\r' || (character === '\n' && data[index - 1] !== '\r')) {
          submitInput()
        } else if (character === '\n') {
          continue
        } else if (character === '\u007f') {
          if (inputBuffer.length > 0) {
            inputBuffer = inputBuffer.slice(0, -1)
            terminal.write('\b \b')
          }
        } else if (character === '\u0003') {
          terminal.write('^C\r\n')
          inputBuffer = ''
          window.desktop.writeTerminal('\u0003')
        } else if (character === '\u000c') {
          terminal.clear()
        } else if (character >= ' ') {
          inputBuffer += character
          terminal.write(character)
        }
      }
    })
    const removeDataListener = window.desktop.onTerminalData((data) => terminal.write(data))
    const removeExitListener = window.desktop.onTerminalExit(({ code }) => {
      terminal.writeln(`\r\n[Shell exited${code === null ? '' : ` with code ${code}`}]`)
      startedWorkspaceRef.current = null
    })
    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && containerRef.current.clientWidth > 0) fitAddon.fit()
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      window.desktop.stopTerminal()
      inputSubscription.dispose()
      removeDataListener()
      removeExitListener()
      resizeObserver.disconnect()
      terminal.dispose()
    }
  }, [])

  useEffect(() => {
    if (!active || !terminalRef.current || !fitAddonRef.current) return

    requestAnimationFrame(() => fitAddonRef.current?.fit())
    if (!workspaceRoot) {
      terminalRef.current.clear()
      terminalRef.current.writeln('Open a workspace to start a terminal.')
      return
    }
    if (startedWorkspaceRef.current === workspaceRoot) {
      terminalRef.current.focus()
      return
    }

    terminalRef.current.clear()
    startedWorkspaceRef.current = workspaceRoot
    void window.desktop.startTerminal()
      .then(() => terminalRef.current?.focus())
      .catch((error: unknown) => {
        startedWorkspaceRef.current = null
        terminalRef.current?.writeln(error instanceof Error ? error.message : 'Could not start terminal.')
      })
  }, [active, workspaceRoot])

  return <div className="terminal-surface" ref={containerRef} />
}
