import { describe, expect, it, vi } from 'vitest'
import { createCommandRegistry } from './commandRegistry'

type Context = { workspaceOpen: boolean }

describe('command registry', () => {
  it('reports enablement from the current context', () => {
    const registry = createCommandRegistry<Context>([
      { id: 'workspace.open', title: 'Open Folder', category: 'File', isEnabled: () => true, run: vi.fn() },
      { id: 'file.save', title: 'Save', category: 'File', isEnabled: (context) => context.workspaceOpen, run: vi.fn() }
    ])

    expect(registry.search('', { workspaceOpen: false }, []).map(({ command, enabled }) => [command.id, enabled])).toEqual([
      ['workspace.open', true],
      ['file.save', false]
    ])
  })

  it('shows recently used commands first for an empty query', () => {
    const registry = createCommandRegistry<Context>([
      { id: 'workspace.open', title: 'Open Folder', category: 'File', isEnabled: () => true, run: vi.fn() },
      { id: 'view.search', title: 'Search Project', category: 'View', isEnabled: () => true, run: vi.fn() }
    ])

    expect(registry.search('', { workspaceOpen: true }, ['view.search']).map((result) => result.command.id)).toEqual([
      'view.search',
      'workspace.open'
    ])
  })

  it('does not invoke a disabled command', async () => {
    const run = vi.fn()
    const registry = createCommandRegistry<Context>([
      { id: 'file.save', title: 'Save', category: 'File', isEnabled: (context) => context.workspaceOpen, run }
    ])

    await expect(registry.invoke('file.save', { workspaceOpen: false })).resolves.toBe(false)
    expect(run).not.toHaveBeenCalled()
  })

  it('uses registered shortcuts as the keyboard source of truth', () => {
    const registry = createCommandRegistry<Context>([
      {
        id: 'file.quick-open',
        title: 'Quick Open',
        category: 'File',
        shortcut: { key: 'p', primary: true },
        isEnabled: (context) => context.workspaceOpen,
        run: vi.fn()
      }
    ])

    const input = { key: 'p', ctrlKey: true, metaKey: false, shiftKey: false, altKey: false }
    expect(registry.findByKeyboard(input, 'win32', { workspaceOpen: true })?.id).toBe('file.quick-open')
    expect(registry.findByKeyboard(input, 'win32', { workspaceOpen: false })).toBeNull()
  })
})
