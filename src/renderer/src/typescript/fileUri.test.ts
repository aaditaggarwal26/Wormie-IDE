import { describe, expect, it } from 'vitest'
import { fileUriToPath, isWorkspaceFilePath, workspacePathToFileUri } from './fileUri'

describe('file URI conversion', () => {
  it('round-trips Windows drive paths and reserved characters', () => {
    const uri = workspacePathToFileUri('C:\\Project Folder\\src\\a#b%20.ts', 'win32')
    expect(uri).toBe('file:///C:/Project%20Folder/src/a%23b%2520.ts')
    expect(fileUriToPath(uri, 'win32')).toBe('C:\\Project Folder\\src\\a#b%20.ts')
  })

  it('round-trips POSIX paths', () => {
    const uri = workspacePathToFileUri('/home/student/project/src/app.ts', 'linux')
    expect(uri).toBe('file:///home/student/project/src/app.ts')
    expect(fileUriToPath(uri, 'linux')).toBe('/home/student/project/src/app.ts')
  })

  it('rejects non-file URIs', () => {
    expect(() => fileUriToPath('https://example.com/file.ts', 'linux')).toThrow('file URI')
  })

  it('rejects sibling-prefix and parent traversal paths', () => {
    expect(isWorkspaceFilePath('C:\\repo', 'c:\\repo\\src\\app.ts', 'win32')).toBe(true)
    expect(isWorkspaceFilePath('C:\\repo', 'C:\\repo-copy\\app.ts', 'win32')).toBe(false)
    expect(isWorkspaceFilePath('/repo', '/repo/src/../../outside.ts', 'linux')).toBe(false)
  })
})
