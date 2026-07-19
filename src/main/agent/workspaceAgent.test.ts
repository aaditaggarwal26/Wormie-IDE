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
      { note: 'Locate the value.', action: { type: 'search', query: 'value' } },
      { note: 'Read the exact source.', action: { type: 'read_file', relativePath: 'value.ts' } },
      { note: 'Change only the literal.', action: { type: 'edit_file', relativePath: 'value.ts', oldText: 'false', newText: 'true' } },
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
        edits: [{ oldText: 'false', newText: 'true' }]
      }])
      expect(await fs.readFile(sourcePath, 'utf8')).toBe('export const value = false\n')
    } finally {
      await fs.rm(rootPath, { recursive: true, force: true })
    }
  })
})
