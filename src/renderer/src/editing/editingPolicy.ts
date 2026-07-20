type EditableDocument = { path: string; content: string; savedContent: string }

export function dirtyDocuments<T extends EditableDocument>(documents: T[]): T[] {
  return documents.filter((document) => document.content !== document.savedContent)
}

export function autosaveCandidates<T extends EditableDocument>(documents: T[], proposalPaths: Set<string>): T[] {
  return dirtyDocuments(documents).filter((document) => !proposalPaths.has(document.path))
}
