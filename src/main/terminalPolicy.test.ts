import { describe, expect, it } from 'vitest'
import { blockedAiCommand, restrictedTerminalEnvironment, TerminalCommandGuard } from './terminalPolicy'

describe('terminal AI command policy', () => {
  it('blocks direct AI CLIs, full paths, and executable extensions', () => {
    expect(blockedAiCommand('codex')).toBe('codex')
    expect(blockedAiCommand('"C:\\Users\\student\\bin\\claude.exe" --help')).toBe('claude')
    expect(blockedAiCommand('gemini.cmd')).toBe('gemini')
  })

  it('blocks package runners and nested shell commands', () => {
    expect(blockedAiCommand('npx @openai/codex')).toBe('@openai/codex')
    expect(blockedAiCommand('npm exec -- @anthropic-ai/claude-code')).toBe('@anthropic-ai/claude-code')
    expect(blockedAiCommand('cmd /c "kimi --help"')).toBe('kimi --help')
    expect(blockedAiCommand('gh copilot suggest "git command"')).toBe('copilot')
  })

  it('allows ordinary commands that merely print an AI product name', () => {
    expect(blockedAiCommand('echo codex')).toBeNull()
    expect(blockedAiCommand('rg "claude" README.md')).toBeNull()
    expect(blockedAiCommand('npm test')).toBeNull()
  })

  it('cancels a blocked line before forwarding Enter to the PTY', () => {
    const guard = new TerminalCommandGuard()
    expect(guard.filter('codex').data).toBe('codex')
    expect(guard.filter('\r')).toEqual({ data: '\u0003', blocked: ['codex'] })
    expect(guard.filter('npm test\r')).toEqual({ data: 'npm test\r', blocked: [] })
  })

  it('tracks shell history and edited command lines', () => {
    const guard = new TerminalCommandGuard()
    guard.filter('npm test\r')
    expect(guard.filter('\u001b[A\r').blocked).toEqual([])
    guard.filter('geminx')
    expect(guard.filter('\u007fi\r').blocked).toEqual(['gemini'])
  })

  it('blocks prefixed commands and environment assignments', () => {
    expect(blockedAiCommand('env MODE=test codex')).toBe('codex')
    expect(blockedAiCommand('start "" claude')).toBe('claude')
  })

  it('removes common AI credentials from terminal environments', () => {
    expect(restrictedTerminalEnvironment({ PATH: 'bin', OPENAI_API_KEY: 'secret', ANTHROPIC_API_KEY: 'secret' })).toEqual({ PATH: 'bin' })
  })
})
