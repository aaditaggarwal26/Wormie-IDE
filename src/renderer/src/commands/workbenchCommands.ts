import { createCommandRegistry, type CommandDefinition } from './commandRegistry'

export type WorkbenchCommandContext = {
  hasWorkspace: boolean
  hasActiveFile: boolean
  hasDirtyFiles: boolean
  hasClosedEditor: boolean
  hasMultipleEditors: boolean
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
  editAssignment: () => void
  importAssignment: () => void
  openClassrooms: () => void
}

const enabled = () => true
const withWorkspace = (context: WorkbenchCommandContext) => context.hasWorkspace
const withActiveFile = (context: WorkbenchCommandContext) => context.hasActiveFile
const withDirtyFiles = (context: WorkbenchCommandContext) => context.hasDirtyFiles

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
  { id: 'file.revealInExplorer', title: 'Reveal Active File in Explorer', category: 'File', isEnabled: withActiveFile, run: (context) => context.revealActiveFile() },
  { id: 'file.copyAbsolutePath', title: 'Copy Absolute Path', category: 'File', isEnabled: withActiveFile, run: (context) => context.copyAbsolutePath() },
  { id: 'file.copyRelativePath', title: 'Copy Relative Path', category: 'File', isEnabled: withActiveFile, run: (context) => context.copyRelativePath() },
  { id: 'view.focusExplorer', title: 'Focus Explorer', category: 'View', isEnabled: enabled, run: (context) => context.focusExplorer() },
  { id: 'view.focusSearch', title: 'Focus Search', category: 'View', isEnabled: enabled, run: (context) => context.focusSearch() },
  { id: 'view.focusTutor', title: 'Focus Tutor', category: 'View', isEnabled: enabled, run: (context) => context.focusTutor() },
  { id: 'view.openSettings', title: 'Open Settings', category: 'View', isEnabled: enabled, run: (context) => context.openSettings() },
  { id: 'view.focusTerminal', title: 'Focus Terminal', category: 'View', shortcut: { key: '`', primary: true }, isEnabled: withWorkspace, run: (context) => context.focusTerminal() },
  { id: 'assignment.edit', title: 'Create or Edit Assignment', category: 'Assignment', isEnabled: withWorkspace, run: (context) => context.editAssignment() },
  { id: 'assignment.import', title: 'Import Assignment Package', category: 'Assignment', isEnabled: enabled, run: (context) => context.importAssignment() },
  { id: 'classroom.open', title: 'Open Classrooms', category: 'Classroom', isEnabled: enabled, run: (context) => context.openClassrooms() }
]

export const workbenchCommandRegistry = createCommandRegistry(definitions)
