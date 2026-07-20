import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import type { ZodType } from 'zod'
import { describe, expect, it } from 'vitest'
import { materializeResolvedProposalEdits } from './proposalEdits'
import type { ModelOperation } from './provider'
import { parseCheckScript, runWorkspaceAgent, TrackedText } from './workspaceAgent'

describe('workspace coding agent', () => {
  it('tracks sequential shadow edits as separate original-coordinate hunks', () => {
    const original = 'const first = false\nconst middle = 1\nconst last = false\n'
    const tracker = new TrackedText(original)
    const firstStart = original.indexOf('false')
    tracker.apply(firstStart, firstStart + 'false'.length, 'true')

    const afterFirst = original.replace('false', 'true')
    const lastStart = afterFirst.lastIndexOf('false')
    tracker.apply(lastStart, lastStart + 'false'.length, 'true')

    const materialized = materializeResolvedProposalEdits(original, tracker.edits(), 'config.ts')
    expect(materialized.content).toBe('const first = true\nconst middle = 1\nconst last = true\n')
    expect(materialized.edits.map((edit) => edit.oldText)).toEqual(['false', 'false'])
    expect(materialized.patch).not.toContain('const middle')
  })

  it('folds repeated repairs inside an inserted region into the original small hunk', () => {
    const original = 'enabled = false\n'
    const tracker = new TrackedText(original)
    tracker.apply(10, 15, 'tru')
    tracker.apply(10, 13, 'true')

    expect(tracker.edits()).toEqual([{ start: 10, end: 15, oldText: 'false', newText: 'true' }])
  })

  it('preserves CRLF source when a line edit changes only its contents', async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-agent-test-'))
    const sourcePath = path.join(rootPath, 'value.ts')
    await fs.writeFile(sourcePath, 'const first = 1\r\nconst second = 2\r\n', 'utf8')
    const actions = [
      { note: 'Read the target line.', action: { type: 'read_file', relativePath: 'value.ts', startLine: 2, endLine: 2 } },
      { note: 'Edit the target line.', action: { type: 'edit_lines', relativePath: 'value.ts', startLine: 2, endLine: 2, newText: 'const second = 3' } },
      { note: 'Finish.', action: { type: 'finish', summary: 'Update second.', explanations: [{ relativePath: 'value.ts', explanation: 'Update the second value.' }], risks: [], verification: [] } }
    ]
    const model = { async generateStructured<T>(_kind: ModelOperation, _prompt: string, schema: ZodType<T>): Promise<T> {
      return schema.parse(actions.shift())
    } }

    try {
      const proposal = await runWorkspaceAgent({ rootPath, request: 'Update second.', model, signal: new AbortController().signal })
      expect(proposal.changes[0].content).toBe('const first = 1\r\nconst second = 3\r\n')
    } finally {
      await fs.rm(rootPath, { recursive: true, force: true })
    }
  })

  it('allows only direct, bounded verification commands from package scripts', () => {
    const scripts = {
      typecheck: 'tsc --noEmit -p tsconfig.node.json && tsc --noEmit -p tsconfig.web.json',
      test: 'vitest run',
      unsafe: 'node scripts/delete-files.js',
      nested: 'npm run typecheck && npm test'
    }

    expect(parseCheckScript('typecheck', scripts)).toEqual([
      { command: 'tsc', args: ['--noEmit', '-p', 'tsconfig.node.json'] },
      { command: 'tsc', args: ['--noEmit', '-p', 'tsconfig.web.json'] }
    ])
    expect(parseCheckScript('test', scripts)).toEqual([{ command: 'vitest', args: ['run'] }])
    expect(parseCheckScript('nested', scripts)).toHaveLength(3)
    expect(parseCheckScript('unsafe', scripts)).toBeNull()
  })

  it('runs a search/read/edit loop without changing the live workspace', async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-agent-test-'))
    const sourcePath = path.join(rootPath, 'value.ts')
    await fs.writeFile(sourcePath, 'export const value = false\n', 'utf8')
    const actions = [
      { note: 'Locate the value.', action: { type: 'search', query: 'value', path: '.' } },
      { note: 'Read the exact source.', action: { type: 'read_file', relativePath: 'value.ts' } },
      { note: 'Change only the line.', action: { type: 'edit_lines', relativePath: 'value.ts', startLine: 1, endLine: 1, newText: 'export const value = true' } },
      {
        note: 'The requested change is complete.',
        action: {
          type: 'finish',
          summary: 'Enable the value.',
          explanations: [{ relativePath: 'value.ts', explanation: 'Enable the existing flag.' }],
          risks: [],
          verification: ['Review the literal change.']
        }
      }
    ]
    let lastPrompt = ''
    const model = {
      async generateStructured<T>(
        _kind: ModelOperation,
        prompt: string,
        schema: ZodType<T>
      ): Promise<T> {
        lastPrompt = prompt
        const action = actions.shift()
        if (!action) throw new Error(lastPrompt)
        return schema.parse(action)
      }
    }

    try {
      const proposal = await runWorkspaceAgent({
        rootPath,
        request: 'Enable the value.',
        model,
        signal: new AbortController().signal
      })
      expect(proposal.changes).toMatchObject([{
        relativePath: 'value.ts',
        action: 'update',
        content: 'export const value = true\n',
        edits: [{ oldText: 'export const value = false', newText: 'export const value = true' }]
      }])
      expect(lastPrompt).toContain('value.ts')
      expect(await fs.readFile(sourcePath, 'utf8')).toBe('export const value = false\n')
    } finally {
      await fs.rm(rootPath, { recursive: true, force: true })
    }
  })

  it('shares one model session and sends only new observations after the first step', async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-agent-test-'))
    await fs.writeFile(path.join(rootPath, 'value.ts'), 'export const value = false\n', 'utf8')
    const actions = [
      { note: 'Read the source.', action: { type: 'read_file', relativePath: 'value.ts' } },
      { note: 'Enable the flag.', action: { type: 'edit_file', relativePath: 'value.ts', oldText: 'false', newText: 'true' } },
      { note: 'Finish.', action: { type: 'finish', summary: 'Enable value.', explanations: [{ relativePath: 'value.ts', explanation: 'Enable the flag.' }], risks: [], verification: [] } }
    ]
    const session = { codexThreadId: null }
    const sessions: unknown[] = []
    const deltas: (string | undefined)[] = []
    const imageBatches: (string[] | undefined)[] = []
    let disposed = 0
    const model = {
      createSession: () => session,
      async disposeSession(value: typeof session): Promise<void> {
        expect(value).toBe(session)
        disposed += 1
      },
      async generateStructured<T>(
        _kind: ModelOperation,
        _prompt: string,
        schema: ZodType<T>,
        _signal: AbortSignal,
        _onProtocolEvent?: (method: string, detail: string) => void,
        options?: { session?: typeof session; deltaPrompt?: string; imagePaths?: string[] }
      ): Promise<T> {
        sessions.push(options?.session)
        deltas.push(options?.deltaPrompt)
        imageBatches.push(options?.imagePaths)
        return schema.parse(actions.shift())
      }
    }

    try {
      await runWorkspaceAgent({
        rootPath,
        request: 'Enable the value.',
        imagePaths: ['/tmp/screenshot.png'],
        model,
        signal: new AbortController().signal
      })
      expect(sessions).toEqual([session, session, session])
      expect(deltas[0]).toBeUndefined()
      expect(deltas[1]).toContain('Step 1 value.ts')
      expect(deltas[1]).not.toContain('Workspace manifest')
      expect(deltas[2]).toContain('updated')
      expect(deltas[2]).not.toContain('Step 1 value.ts')
      expect(imageBatches).toEqual([['/tmp/screenshot.png'], undefined, undefined])
      expect(disposed).toBe(1)
    } finally {
      await fs.rm(rootPath, { recursive: true, force: true })
    }
  })

  it('ignores generated release output when building workspace context', async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-agent-test-'))
    await fs.mkdir(path.join(rootPath, 'release'), { recursive: true })
    await fs.writeFile(path.join(rootPath, 'release', 'generated.js'), 'generated bundle', 'utf8')
    await fs.writeFile(path.join(rootPath, 'source.ts'), 'const mode = "old"\n', 'utf8')
    const prompts: string[] = []
    const actions = [
      { note: 'Read source.', action: { type: 'read_file', relativePath: 'source.ts' } },
      { note: 'Edit source.', action: { type: 'edit_file', relativePath: 'source.ts', oldText: '"old"', newText: '"new"' } },
      { note: 'Finish.', action: { type: 'finish', summary: 'Update mode.', explanations: [{ relativePath: 'source.ts', explanation: 'Update the mode.' }], risks: [], verification: [] } }
    ]
    const model = { async generateStructured<T>(_kind: ModelOperation, prompt: string, schema: ZodType<T>): Promise<T> {
      prompts.push(prompt)
      return schema.parse(actions.shift())
    } }

    try {
      await runWorkspaceAgent({ rootPath, request: 'Update mode.', model, signal: new AbortController().signal })
      expect(prompts[0]).toContain('source.ts')
      expect(prompts[0]).not.toContain('release/generated.js')
    } finally {
      await fs.rm(rootPath, { recursive: true, force: true })
    }
  })

  it('allows completion when a verification failure is unchanged from the original workspace', async () => {
    const rootPath = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-agent-test-'))
    const binPath = path.join(rootPath, 'node_modules', '.bin')
    await fs.mkdir(binPath, { recursive: true })
    await fs.writeFile(path.join(rootPath, 'package.json'), JSON.stringify({ scripts: { test: 'vitest' } }), 'utf8')
    await fs.writeFile(path.join(rootPath, 'value.ts'), 'export const value = false\n', 'utf8')
    const executable = path.join(binPath, 'vitest')
    await fs.writeFile(executable, '#!/usr/bin/env node\nprocess.stderr.write("existing failure\\n"); process.exit(1)\n', 'utf8')
    await fs.chmod(executable, 0o755)
    const actions = [
      { note: 'Read source.', action: { type: 'read_file', relativePath: 'value.ts' } },
      { note: 'Edit source.', action: { type: 'edit_file', relativePath: 'value.ts', oldText: 'false', newText: 'true' } },
      { note: 'Verify.', action: { type: 'run_check', checkId: 'package:test' } },
      { note: 'Finish.', action: { type: 'finish', summary: 'Enable value.', explanations: [{ relativePath: 'value.ts', explanation: 'Enable the value.' }], risks: [], verification: [] } }
    ]
    const model = { async generateStructured<T>(_kind: ModelOperation, _prompt: string, schema: ZodType<T>): Promise<T> {
      return schema.parse(actions.shift())
    } }

    try {
      const proposal = await runWorkspaceAgent({ rootPath, request: 'Enable value.', model, signal: new AbortController().signal })
      expect(proposal.verification).toContain('Baseline failure unchanged: npm run test')
      expect(proposal.risks).not.toContain('Automated verification did not pass: npm run test')
    } finally {
      await fs.rm(rootPath, { recursive: true, force: true })
    }
  })
})
