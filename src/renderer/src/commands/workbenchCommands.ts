import { createCommandRegistry, type CommandDefinition } from './commandRegistry'

export type WorkbenchCommandContext = {
  hasWorkspace: boolean
  hasActiveFile: boolean
  hasDirtyFiles: boolean
  hasClosedEditor: boolean
  hasMultipleEditors: boolean
  hasTypeScriptFile: boolean
  openFolder: () => void
  save: () => void
  saveAll: () => void
  closeOthers: () => void
  closeSaved: () => void
  reopenClosedEditor: () => void
  openQuickOpen: () => void
  openCommandPalette: () => void
  openSearch: () => void
  openGoToLine: () => void
  revealActiveFile: () => void
  copyAbsolutePath: () => void
  copyRelativePath: () => void
  focusExplorer: () => void
  focusSearch: () => void
  focusTutor: () => void
  openSettings: () => void
  focusTerminal: () => void
  runEditorAction: (actionId: string) => void
  renameSymbol: () => void
}

const enabled = () => true
const withWorkspace = (context: WorkbenchCommandContext) => context.hasWorkspace
const withActiveFile = (context: WorkbenchCommandContext) => context.hasActiveFile
const withDirtyFiles = (context: WorkbenchCommandContext) => context.hasDirtyFiles
const withTypeScriptFile = (context: WorkbenchCommandContext) => context.hasTypeScriptFile

const definitions: CommandDefinition<WorkbenchCommandContext>[] = [
  { id: 'workbench.commandPalette', title: 'Show Command Palette', category: 'View', shortcut: { key: 'p', primary: true, shift: true }, isEnabled: enabled, run: (context) => context.openCommandPalette() },
  { id: 'workspace.openFolder', title: 'Open Folder', category: 'File', shortcut: { key: 'o', primary: true }, isEnabled: enabled, run: (context) => context.openFolder() },
  { id: 'workspace.quickOpen', title: 'Quick Open', category: 'File', shortcut: { key: 'p', primary: true }, isEnabled: withWorkspace, run: (context) => context.openQuickOpen() },
  { id: 'file.save', title: 'Save', category: 'File', shortcut: { key: 's', primary: true }, isEnabled: withActiveFile, run: (context) => context.save() },
  { id: 'file.saveAll', title: 'Save All', category: 'File', shortcut: { key: 's', primary: true, alt: true }, isEnabled: withDirtyFiles, run: (context) => context.saveAll() },
  { id: 'editor.closeOthers', title: 'Close Other Editors', category: 'View', isEnabled: (context) => context.hasMultipleEditors, run: (context) => context.closeOthers() },
  { id: 'editor.closeSaved', title: 'Close Saved Editors', category: 'View', isEnabled: withWorkspace, run: (context) => context.closeSaved() },
  { id: 'editor.reopenClosed', title: 'Reopen Closed Editor', category: 'View', isEnabled: (context) => context.hasClosedEditor, run: (context) => context.reopenClosedEditor() },
  { id: 'search.project', title: 'Search Project', category: 'Search', shortcut: { key: 'f', primary: true, shift: true }, isEnabled: withWorkspace, run: (context) => context.openSearch() },
  { id: 'editor.goToLine', title: 'Go to Line', category: 'Go', shortcut: { key: 'g', primary: true }, isEnabled: withActiveFile, run: (context) => context.openGoToLine() },
  { id: 'editor.goToDefinition', title: 'Go to Definition', category: 'Go', shortcut: { key: 'F12' }, isEnabled: withTypeScriptFile, run: (context) => context.runEditorAction('editor.action.revealDefinition') },
  { id: 'editor.peekDefinition', title: 'Peek Definition', category: 'Go', shortcut: { key: 'F12', alt: true }, isEnabled: withTypeScriptFile, run: (context) => context.runEditorAction('editor.action.peekDefinition') },
  { id: 'editor.findReferences', title: 'Find All References', category: 'Go', shortcut: { key: 'F12', shift: true }, isEnabled: withTypeScriptFile, run: (context) => context.runEditorAction('editor.action.goToReferences') },
  { id: 'editor.renameSymbol', title: 'Rename Symbol Safely', category: 'Refactor', shortcut: { key: 'F2' }, isEnabled: withTypeScriptFile, run: (context) => context.renameSymbol() },
  { id: 'editor.goToSymbol', title: 'Go to Symbol in Editor', category: 'Go', shortcut: { key: 'o', primary: true, shift: true }, isEnabled: withTypeScriptFile, run: (context) => context.runEditorAction('editor.action.quickOutline') },
  { id: 'editor.quickFix', title: 'Quick Fix', category: 'Refactor', shortcut: { key: '.', primary: true }, isEnabled: withTypeScriptFile, run: (context) => context.runEditorAction('editor.action.quickFix') },
  { id: 'editor.organizeImports', title: 'Organize Imports', category: 'Refactor', shortcut: { key: 'o', shift: true, alt: true }, isEnabled: withTypeScriptFile, run: (context) => context.runEditorAction('editor.action.organizeImports') },
  { id: 'file.revealInExplorer', title: 'Reveal Active File in Explorer', category: 'File', isEnabled: withActiveFile, run: (context) => context.revealActiveFile() },
  { id: 'file.copyAbsolutePath', title: 'Copy Absolute Path', category: 'File', isEnabled: withActiveFile, run: (context) => context.copyAbsolutePath() },
  { id: 'file.copyRelativePath', title: 'Copy Relative Path', category: 'File', isEnabled: withActiveFile, run: (context) => context.copyRelativePath() },
  { id: 'view.focusExplorer', title: 'Focus Explorer', category: 'View', isEnabled: enabled, run: (context) => context.focusExplorer() },
  { id: 'view.focusSearch', title: 'Focus Search', category: 'View', isEnabled: enabled, run: (context) => context.focusSearch() },
  { id: 'view.focusTutor', title: 'Focus Tutor', category: 'View', isEnabled: enabled, run: (context) => context.focusTutor() },
  { id: 'view.openSettings', title: 'Open Settings', category: 'View', isEnabled: enabled, run: (context) => context.openSettings() },
  { id: 'view.focusTerminal', title: 'Focus Terminal', category: 'View', shortcut: { key: '`', primary: true }, isEnabled: withWorkspace, run: (context) => context.focusTerminal() }
]

export const workbenchCommandRegistry = createCommandRegistry(definitions)
