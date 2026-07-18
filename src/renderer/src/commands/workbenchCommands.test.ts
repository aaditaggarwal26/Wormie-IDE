import { describe, expect, it, vi } from 'vitest'
import { workbenchCommandRegistry, type WorkbenchCommandContext } from './workbenchCommands'

function context(hasTypeScriptFile: boolean): WorkbenchCommandContext {
  const action = vi.fn()
  return {
    hasWorkspace: true,
    hasActiveFile: true,
    hasDirtyFiles: false,
    hasClosedEditor: false,
    hasMultipleEditors: false,
    hasTypeScriptFile,
    openFolder: action,
    save: action,
    saveAll: action,
    closeOthers: action,
    closeSaved: action,
    reopenClosedEditor: action,
    openQuickOpen: action,
    openCommandPalette: action,
    openSearch: action,
    openGoToLine: action,
    revealActiveFile: action,
    copyAbsolutePath: action,
    copyRelativePath: action,
    focusExplorer: action,
    focusSearch: action,
    focusTutor: action,
    openSettings: action,
    focusTerminal: action,
    editAssignment: action,
    importAssignment: action,
    openClassrooms: action,
    runEditorAction: action,
    renameSymbol: action
  }
}

describe('TypeScript workbench commands', () => {
  it('enables safe rename only for supported source files and owns F2', () => {
    const keyboard = { key: 'F2', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false }
    expect(workbenchCommandRegistry.findByKeyboard(keyboard, 'win32', context(false))).toBeNull()
    expect(workbenchCommandRegistry.findByKeyboard(keyboard, 'win32', context(true))?.id).toBe('editor.renameSymbol')
  })
})
