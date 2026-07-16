import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { clipboard, ipcMain, type WebContents } from 'electron'
import { IPC_CHANNELS } from '../shared/contracts'

const sessions = new Map<number, ChildProcessWithoutNullStreams>()
const maxClipboardLength = 1_000_000

function stopSession(senderId: number): void {
  const session = sessions.get(senderId)
  if (!session) return
  session.kill()
  sessions.delete(senderId)
}

function shellCommand(): { command: string; args: string[] } {
  if (process.platform === 'win32') {
    return {
      command: process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe',
      args: ['/Q']
    }
  }

  return { command: process.env.SHELL ?? '/bin/sh', args: ['-i'] }
}

function connectOutput(session: ChildProcessWithoutNullStreams, sender: WebContents): void {
  const sendData = (data: string) => {
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.terminalData, data)
  }
  session.stdout.on('data', (data: Buffer) => sendData(data.toString()))
  session.stderr.on('data', (data: Buffer) => sendData(data.toString()))
  session.on('error', (error) => sendData(`\r\n${error.message}\r\n`))
  session.on('close', (code) => {
    sessions.delete(sender.id)
    if (!sender.isDestroyed()) sender.send(IPC_CHANNELS.terminalExit, { code })
  })
}

export function registerTerminalHandlers(getWorkspaceRoot: () => string | null): void {
  ipcMain.handle(IPC_CHANNELS.terminalStart, (event) => {
    const workspaceRoot = getWorkspaceRoot()
    if (!workspaceRoot) throw new Error('Open a workspace before starting a terminal.')

    stopSession(event.sender.id)
    const { command, args } = shellCommand()
    const session = spawn(command, args, {
      cwd: workspaceRoot,
      env: { ...process.env, TERM: 'xterm-256color' },
      stdio: 'pipe',
      windowsHide: true
    })

    sessions.set(event.sender.id, session)
    connectOutput(session, event.sender)
    event.sender.once('destroyed', () => stopSession(event.sender.id))
  })

  ipcMain.on(IPC_CHANNELS.terminalWrite, (event, data: string) => {
    const session = sessions.get(event.sender.id)
    if (!session || session.stdin.destroyed || typeof data !== 'string' || data.length > 100_000) return
    session.stdin.write(data.replace(/\r(?!\n)/g, '\r\n'))
  })

  ipcMain.on(IPC_CHANNELS.terminalStop, (event) => stopSession(event.sender.id))

  ipcMain.handle(IPC_CHANNELS.terminalCopy, (_event, text: string) => {
    if (typeof text !== 'string' || text.length === 0 || text.length > maxClipboardLength) {
      throw new Error('Select between 1 and 1,000,000 characters to copy.')
    }
    clipboard.writeText(text)
  })
}
