import fs from 'node:fs'
import path from 'node:path'
import { app, clipboard, ipcMain, type IpcMainEvent, type IpcMainInvokeEvent, type WebContents } from 'electron'
import * as pty from 'node-pty'
import {
  IPC_CHANNELS,
  type TerminalResizeRequest,
  type TerminalSessionInfo,
  type TerminalSessionRequest,
  type TerminalWriteRequest
} from '../shared/contracts'
import { blockedAiExecutables, restrictedTerminalEnvironment, TerminalCommandGuard } from './terminalPolicy'

type TerminalSession = {
  process: pty.IPty
  dataSubscription: pty.IDisposable
  exitSubscription: pty.IDisposable
  guard: TerminalCommandGuard
}

const sessions = new Map<number, Map<string, TerminalSession>>()
const watchedSenders = new Set<number>()
const maxClipboardLength = 1_000_000
const maxTerminalWriteLength = 1_000_000
const maxSessionsPerWindow = 16
const sessionIdPattern = /^[a-zA-Z0-9_-]{1,100}$/
const terminalPolicyMessage = '\r\n\u001b[38;5;214m[Wormie policy] AI CLI commands are disabled in student terminals.\u001b[0m\r\n'

function policyShimDirectory(): string {
  const directory = path.join(app.getPath('userData'), 'terminal-command-policy')
  fs.mkdirSync(directory, { recursive: true })
  const windows = process.platform === 'win32'
  const contents = windows
    ? '@echo off\r\necho [Wormie policy] AI CLI commands are disabled in student terminals.\r\nexit /b 126\r\n'
    : "#!/bin/sh\nprintf '%s\\n' '[Wormie policy] AI CLI commands are disabled in student terminals.'\nexit 126\n"

  for (const executable of blockedAiExecutables) {
    const filename = path.join(directory, windows ? `${executable}.cmd` : executable)
    if (!fs.existsSync(filename) || fs.readFileSync(filename, 'utf8') !== contents) {
      fs.writeFileSync(filename, contents, windows ? 'utf8' : { encoding: 'utf8', mode: 0o755 })
    }
    if (!windows) fs.chmodSync(filename, 0o755)
  }
  return directory
}

function terminalEnvironment(): NodeJS.ProcessEnv {
  const environment = restrictedTerminalEnvironment({ ...process.env, TERM: 'xterm-256color' })
  const pathKey = process.platform === 'win32'
    ? Object.keys(environment).find((key) => key.toUpperCase() === 'PATH') ?? 'Path'
    : 'PATH'
  environment[pathKey] = `${policyShimDirectory()}${path.delimiter}${environment[pathKey] ?? ''}`
  return environment
}

function sessionMap(senderId: number): Map<string, TerminalSession> {
  const existing = sessions.get(senderId)
  if (existing) return existing
  const created = new Map<string, TerminalSession>()
  sessions.set(senderId, created)
  return created
}

function stopSession(senderId: number, sessionId: string): void {
  const senderSessions = sessions.get(senderId)
  const session = senderSessions?.get(sessionId)
  if (!session) return
  senderSessions?.delete(sessionId)
  if (senderSessions?.size === 0) sessions.delete(senderId)
  session.dataSubscription.dispose()
  session.exitSubscription.dispose()
  try {
    session.process.kill()
  } catch {
    // The PTY may already have exited between lookup and disposal.
  }
}

function stopAllSessions(senderId: number): void {
  const sessionIds = [...(sessions.get(senderId)?.keys() ?? [])]
  for (const sessionId of sessionIds) stopSession(senderId, sessionId)
}

function watchSender(sender: WebContents): void {
  if (watchedSenders.has(sender.id)) return
  watchedSenders.add(sender.id)
  sender.once('destroyed', () => {
    stopAllSessions(sender.id)
    watchedSenders.delete(sender.id)
  })
}

function shellCommand(): { command: string; args: string[]; name: string } {
  if (process.platform === 'win32') {
    const command = process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe'
    return { command, args: [], name: path.basename(command) }
  }

  const command = process.env.SHELL ?? '/bin/sh'
  return { command, args: ['-l'], name: path.basename(command) }
}

function validSessionId(value: unknown): value is string {
  return typeof value === 'string' && sessionIdPattern.test(value)
}

function terminalDimension(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isInteger(value)) return fallback
  return Math.min(Math.max(value, 2), 500)
}

export function registerTerminalHandlers(
  getWorkspaceRoot: () => string | null,
  isTrustedSender: (event: IpcMainEvent | IpcMainInvokeEvent) => boolean
): void {
  const trusted = (event: IpcMainEvent | IpcMainInvokeEvent) => isTrustedSender(event)

  ipcMain.handle(IPC_CHANNELS.terminalStart, (event, request: TerminalSessionRequest): TerminalSessionInfo => {
    if (!trusted(event)) throw new Error('Terminal access was denied for this window.')
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('Open a workspace before starting a terminal.')
    if (!validSessionId(request?.sessionId)) throw new Error('Choose a valid terminal session.')

    const senderSessions = sessions.get(event.sender.id)
    if (!senderSessions?.has(request.sessionId) && (senderSessions?.size ?? 0) >= maxSessionsPerWindow) {
      throw new Error(`A window can run at most ${maxSessionsPerWindow} terminals.`)
    }
    stopSession(event.sender.id, request.sessionId)

    const shell = shellCommand()
    const terminalProcess = pty.spawn(shell.command, shell.args, {
      name: 'xterm-256color',
      cols: terminalDimension(request.columns, 80),
      rows: terminalDimension(request.rows, 24),
      cwd: workspaceRoot,
      env: terminalEnvironment()
    })

    const terminalSession = {} as TerminalSession
    terminalSession.process = terminalProcess
    terminalSession.guard = new TerminalCommandGuard()
    terminalSession.dataSubscription = terminalProcess.onData((data) => {
      terminalSession.guard.observeOutput(data)
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.terminalData, { sessionId: request.sessionId, data })
      }
    })
    terminalSession.exitSubscription = terminalProcess.onExit(({ exitCode, signal }) => {
      const current = sessions.get(event.sender.id)?.get(request.sessionId)
      if (current !== terminalSession) return
      sessions.get(event.sender.id)?.delete(request.sessionId)
      if (sessions.get(event.sender.id)?.size === 0) sessions.delete(event.sender.id)
      terminalSession.dataSubscription.dispose()
      terminalSession.exitSubscription.dispose()
      if (!event.sender.isDestroyed()) {
        event.sender.send(IPC_CHANNELS.terminalExit, {
          sessionId: request.sessionId,
          code: exitCode,
          signal: signal ?? null
        })
      }
    })

    sessionMap(event.sender.id).set(request.sessionId, terminalSession)
    watchSender(event.sender)
    return { sessionId: request.sessionId, shellName: shell.name }
  })

  ipcMain.on(IPC_CHANNELS.terminalWrite, (event, request: TerminalWriteRequest) => {
    if (!trusted(event) || !validSessionId(request?.sessionId)) return
    if (typeof request.data !== 'string' || request.data.length > maxTerminalWriteLength) return
    const session = sessions.get(event.sender.id)?.get(request.sessionId)
    if (!session) return
    const result = session.guard.filter(request.data)
    if (result.data) session.process.write(result.data)
    if (result.blocked.length > 0 && !event.sender.isDestroyed()) {
      event.sender.send(IPC_CHANNELS.terminalData, { sessionId: request.sessionId, data: terminalPolicyMessage })
    }
  })

  ipcMain.on(IPC_CHANNELS.terminalResize, (event, request: TerminalResizeRequest) => {
    if (!trusted(event) || !validSessionId(request?.sessionId)) return
    const session = sessions.get(event.sender.id)?.get(request.sessionId)
    if (!session) return
    try {
      session.process.resize(terminalDimension(request.columns, session.process.cols), terminalDimension(request.rows, session.process.rows))
    } catch {
      // A resize can race with normal shell shutdown.
    }
  })

  ipcMain.on(IPC_CHANNELS.terminalStop, (event, sessionId: string) => {
    if (!trusted(event) || !validSessionId(sessionId)) return
    stopSession(event.sender.id, sessionId)
  })

  ipcMain.handle(IPC_CHANNELS.terminalCopy, (event, text: string) => {
    if (!trusted(event)) throw new Error('Clipboard access was denied for this window.')
    if (typeof text !== 'string' || text.length === 0 || text.length > maxClipboardLength) {
      throw new Error('Select between 1 and 1,000,000 characters to copy.')
    }
    clipboard.writeText(text)
  })

  ipcMain.handle(IPC_CHANNELS.terminalReadClipboard, (event): string => {
    if (!trusted(event)) throw new Error('Clipboard access was denied for this window.')
    return clipboard.readText().slice(0, maxClipboardLength)
  })
}
