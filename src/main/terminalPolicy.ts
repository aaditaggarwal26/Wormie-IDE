import path from 'node:path'

export const blockedAiExecutables = [
  'aichat',
  'aider',
  'aider-chat',
  'amazon-q',
  'amp',
  'anthropic',
  'chatgpt',
  'claude',
  'claude-code',
  'cline',
  'codex',
  'codeium',
  'continue',
  'copilot',
  'cody',
  'crush',
  'cursor-agent',
  'deepseek',
  'devin',
  'droid',
  'fabric',
  'gemini',
  'gemini-cli',
  'glm',
  'glm-cli',
  'goose',
  'gpt',
  'grok',
  'iflow',
  'interpreter',
  'kilocode',
  'kimi',
  'kimi-cli',
  'llamafile',
  'llm',
  'lmstudio',
  'mentat',
  'mistral',
  'mods',
  'ollama',
  'openhands',
  'open-interpreter',
  'openai',
  'opencode',
  'perplexity',
  'plandex',
  'qodercli',
  'qwen',
  'qwen-code',
  'roo',
  'roo-code',
  'sgpt',
  'shell-gpt',
  'tabby',
  'tgpt',
  'vllm',
  'windsurf'
] as const

const blockedExecutableSet = new Set<string>(blockedAiExecutables)
const argumentScanningCommands = new Set([
  'bash', 'brew', 'bun', 'bunx', 'choco', 'cmd', 'deno', 'docker', 'gh', 'npm', 'npx',
  'node', 'pip', 'pip3', 'pipx', 'pnpm', 'pnpx', 'podman', 'powershell', 'pwsh', 'py',
  'python', 'python3', 'scoop', 'sh', 'uv', 'uvx', 'winget', 'yarn', 'zsh'
])
const commandPrefixes = new Set(['call', 'command', 'env', 'exec', 'nohup', 'start', 'sudo', 'time'])
const blockedEnvironmentKeys = new Set([
  'ANTHROPIC_API_KEY',
  'AWS_BEARER_TOKEN_BEDROCK',
  'AZURE_OPENAI_API_KEY',
  'CEREBRAS_API_KEY',
  'CLAUDE_CODE_OAUTH_TOKEN',
  'CODEX_API_KEY',
  'COHERE_API_KEY',
  'DEEPSEEK_API_KEY',
  'FIREWORKS_API_KEY',
  'GEMINI_API_KEY',
  'GOOGLE_API_KEY',
  'GOOGLE_GENERATIVE_AI_API_KEY',
  'GROQ_API_KEY',
  'HF_TOKEN',
  'HUGGINGFACE_API_KEY',
  'MISTRAL_API_KEY',
  'OPENAI_API_KEY',
  'OPENROUTER_API_KEY',
  'PERPLEXITY_API_KEY',
  'REPLICATE_API_TOKEN',
  'TOGETHER_API_KEY',
  'XAI_API_KEY'
])

function stripQuotes(value: string): string {
  if (value.length >= 2 && ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'")))) {
    return value.slice(1, -1)
  }
  return value
}

function commandName(value: string): string {
  const basename = path.basename(stripQuotes(value).replaceAll('\\', '/')).toLowerCase()
  return basename.replace(/\.(?:bat|cmd|com|exe|ps1|sh)$/i, '')
}

function containsAiMarker(value: string): boolean {
  const normalized = stripQuotes(value).toLowerCase()
  return blockedAiExecutables.some((marker) => {
    const index = normalized.indexOf(marker)
    if (index < 0) return false
    const before = normalized[index - 1]
    const after = normalized[index + marker.length]
    return (!before || !/[a-z0-9]/.test(before)) && (!after || !/[a-z0-9]/.test(after))
  })
}

function tokenize(command: string): string[] {
  return command.match(/"(?:[^"\\]|\\.)*"|'[^']*'|&&|\|\||[|;&]|[^\s|;&]+/g) ?? []
}

function commandSegments(command: string): string[][] {
  const segments: string[][] = [[]]
  for (const token of tokenize(command)) {
    if (token === '&&' || token === '||' || token === '|' || token === ';' || token === '&') {
      if (segments.at(-1)?.length) segments.push([])
    } else {
      segments.at(-1)?.push(token)
    }
  }
  return segments.filter((segment) => segment.length > 0)
}

function decodedPowerShellCommand(tokens: string[]): string | null {
  const encodedIndex = tokens.findIndex((token) => /^-(?:e|ec|en|enc|enco|encod|encode|encodedcommand)$/i.test(stripQuotes(token)))
  if (encodedIndex < 0 || !tokens[encodedIndex + 1]) return null
  try {
    const bytes = Buffer.from(stripQuotes(tokens[encodedIndex + 1]), 'base64')
    const utf16 = bytes.toString('utf16le').replaceAll('\u0000', '')
    return utf16 || bytes.toString('utf8')
  } catch {
    return null
  }
}

function blockedSegment(segment: string[]): string | null {
  let commandIndex = segment.findIndex((token) => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(stripQuotes(token)))
  while (commandIndex >= 0 && commandPrefixes.has(commandName(segment[commandIndex]))) {
    commandIndex += 1
    while (commandIndex < segment.length && (
      stripQuotes(segment[commandIndex]) === '' ||
      /^[A-Za-z_][A-Za-z0-9_]*=/.test(stripQuotes(segment[commandIndex]))
    )) commandIndex += 1
  }
  if (commandIndex < 0 || commandIndex >= segment.length) return null

  const executable = commandName(segment[commandIndex])
  if (blockedExecutableSet.has(executable) || containsAiMarker(executable)) return executable

  const args = segment.slice(commandIndex + 1)
  if (argumentScanningCommands.has(executable)) {
    const marker = args.find(containsAiMarker)
    if (marker) return stripQuotes(marker)
  }

  if (executable === 'powershell' || executable === 'pwsh') {
    const decoded = decodedPowerShellCommand(args)
    if (decoded) return blockedAiCommand(decoded)
  }
  return null
}

export function blockedAiCommand(command: string): string | null {
  for (const segment of commandSegments(command)) {
    const blocked = blockedSegment(segment)
    if (blocked) return blocked
  }
  return null
}

export function restrictedTerminalEnvironment(environment: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return Object.fromEntries(Object.entries(environment).filter(([key]) => !blockedEnvironmentKeys.has(key.toUpperCase())))
}

export type TerminalPolicyResult = {
  data: string
  blocked: string[]
}

export class TerminalCommandGuard {
  private line = ''
  private cursor = 0
  private continuation = ''
  private history: string[] = []
  private historyIndex = 0
  private alternateScreen = false
  private outputTail = ''

  observeOutput(data: string): void {
    const combined = this.outputTail + data
    const matches = [...combined.matchAll(/\u001b\[\?(?:47|1047|1049)([hl])/g)]
    if (matches.length) this.alternateScreen = matches.at(-1)?.[1] === 'h'
    this.outputTail = combined.slice(-32)
    if (this.alternateScreen) this.resetLine()
  }

  filter(data: string): TerminalPolicyResult {
    if (this.alternateScreen) return { data, blocked: [] }
    let forwarded = ''
    const blocked: string[] = []

    for (let index = 0; index < data.length; index += 1) {
      const character = data[index]
      if (character === '\u001b') {
        const sequence = data.slice(index).match(/^\u001b\[[0-9;?]*[~A-Za-z]/)?.[0]
        if (sequence) {
          forwarded += sequence
          this.applyEscape(sequence)
          index += sequence.length - 1
          continue
        }
      }

      if (character === '\r' || character === '\n') {
        const logicalLine = `${this.continuation}${this.line}`
        const continuation = /[\\^`]$/.test(logicalLine)
        if (continuation) {
          this.continuation = logicalLine.slice(0, -1)
          forwarded += character
          this.resetLine(false)
          continue
        }

        const denied = blockedAiCommand(logicalLine)
        if (denied) {
          blocked.push(denied)
          forwarded += '\u0003'
        } else {
          forwarded += character
          if (logicalLine.trim()) {
            if (this.history.at(-1) !== logicalLine) this.history.push(logicalLine)
            this.historyIndex = this.history.length
          }
        }
        this.continuation = ''
        this.resetLine(false)
        continue
      }

      forwarded += character
      if (character === '\u0003' || character === '\u0015') {
        this.continuation = ''
        this.resetLine()
      } else if (character === '\u0001') {
        this.cursor = 0
      } else if (character === '\u0005') {
        this.cursor = this.line.length
      } else if (character === '\u000b') {
        this.line = this.line.slice(0, this.cursor)
      } else if (character === '\u0017') {
        const before = this.line.slice(0, this.cursor).replace(/\s*\S+\s*$/, '')
        this.line = before + this.line.slice(this.cursor)
        this.cursor = before.length
      } else if (character === '\u007f' || character === '\b') {
        if (this.cursor > 0) {
          this.line = this.line.slice(0, this.cursor - 1) + this.line.slice(this.cursor)
          this.cursor -= 1
        }
      } else if (character >= ' ') {
        this.line = this.line.slice(0, this.cursor) + character + this.line.slice(this.cursor)
        this.cursor += 1
      }
    }

    return { data: forwarded, blocked }
  }

  private applyEscape(sequence: string): void {
    if (sequence === '\u001b[A') {
      if (this.historyIndex > 0) this.historyIndex -= 1
      this.line = this.history[this.historyIndex] ?? this.line
      this.cursor = this.line.length
    } else if (sequence === '\u001b[B') {
      if (this.historyIndex < this.history.length) this.historyIndex += 1
      this.line = this.history[this.historyIndex] ?? ''
      this.cursor = this.line.length
    } else if (sequence === '\u001b[D') {
      this.cursor = Math.max(0, this.cursor - 1)
    } else if (sequence === '\u001b[C') {
      this.cursor = Math.min(this.line.length, this.cursor + 1)
    } else if (sequence === '\u001b[H' || sequence === '\u001b[1~') {
      this.cursor = 0
    } else if (sequence === '\u001b[F' || sequence === '\u001b[4~') {
      this.cursor = this.line.length
    } else if (sequence === '\u001b[3~' && this.cursor < this.line.length) {
      this.line = this.line.slice(0, this.cursor) + this.line.slice(this.cursor + 1)
    }
  }

  private resetLine(resetHistory = true): void {
    this.line = ''
    this.cursor = 0
    if (resetHistory) this.historyIndex = this.history.length
  }
}
