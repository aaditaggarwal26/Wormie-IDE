import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { AssignmentManifestDraft } from '../../shared/contracts'
import { createAssignmentPackage, importAssignmentPackage } from './package'
import { saveAssignment } from './storage'

const temporaryDirectories: string[] = []

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })))
})

describe('assignment packages', () => {
  it('exports starter files while excluding secrets and local metadata', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-'))
    temporaryDirectories.push(workspace)
    await fs.mkdir(path.join(workspace, 'src'))
    await fs.writeFile(path.join(workspace, 'src', 'screen.tsx'), 'export const screen = true\n')
    await fs.writeFile(path.join(workspace, '.env'), 'SECRET=value\n')
    await fs.writeFile(path.join(workspace, '.env.example'), 'SECRET=\n')
    await fs.writeFile(path.join(workspace, '.git-credentials'), 'https://token@example.com\n')
    await fs.writeFile(path.join(workspace, 'old.wormie-package.json'), '{}\n')
    await fs.writeFile(path.join(workspace, 'terraform.tfstate'), '{"token":"secret"}\n')
    await fs.writeFile(path.join(workspace, 'production.tfvars'), 'token="secret"\n')
    await fs.writeFile(path.join(workspace, 'application_default_credentials.json'), '{}\n')
    await fs.mkdir(path.join(workspace, '.SSH'))
    await fs.writeFile(path.join(workspace, '.SSH', 'id_ed25519'), 'private key\n')
    const draft: AssignmentManifestDraft = {
      title: 'Screen assignment',
      summary: 'Complete the screen.',
      instructions: 'Read the starter code first.',
      tasks: [{ id: 'screen', title: 'Screen', description: 'Complete it.', filePath: 'src/screen.tsx', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'learning-gated', passingScore: 80, allowGeneration: true },
      evidencePolicy: { includeAiActivity: true, includeFileSnapshots: true }
    }
    await saveAssignment(workspace, draft)

    const result = await createAssignmentPackage(workspace)
    const paths = result.value.files.map((file) => file.path)
    expect(paths).toContain('src/screen.tsx')
    expect(paths).toContain('.env.example')
    expect(paths).not.toContain('.env')
    expect(paths).not.toContain('.git-credentials')
    expect(paths).not.toContain('old.wormie-package.json')
    expect(paths).not.toContain('terraform.tfstate')
    expect(paths).not.toContain('production.tfvars')
    expect(paths).not.toContain('application_default_credentials.json')
    expect(paths.some((file) => file.toLowerCase().startsWith('.ssh/'))).toBe(false)
    expect(paths.some((file) => file.startsWith('.wormie/'))).toBe(false)
    expect(result.value.assignment.title).toBe('Screen assignment')
  })

  it('imports an integrity-checked package into a new assignment workspace', async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-source-'))
    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-destination-'))
    temporaryDirectories.push(source, destination)
    await fs.mkdir(path.join(source, 'src'))
    await fs.writeFile(path.join(source, 'src', 'screen.tsx'), 'export const screen = true\n')
    const draft: AssignmentManifestDraft = {
      title: 'Imported screen', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'screen', title: 'Screen', description: 'Complete it.', filePath: 'src/screen.tsx', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'learning-gated', passingScore: 80, allowGeneration: true },
      evidencePolicy: { includeAiActivity: true, includeFileSnapshots: true }
    }
    await saveAssignment(source, draft)
    const assignmentPackage = await createAssignmentPackage(source)
    const packagePath = path.join(destination, 'assignment.wormie-package.json')
    await fs.writeFile(packagePath, assignmentPackage.payload)

    const imported = await importAssignmentPackage(packagePath, destination)
    expect(await fs.readFile(path.join(imported.rootPath, 'src', 'screen.tsx'), 'utf8')).toContain('screen = true')
    expect(JSON.parse(await fs.readFile(path.join(imported.rootPath, '.wormie', 'student.json'), 'utf8'))).toMatchObject({ schemaVersion: 1 })
    expect(imported.assignmentTitle).toBe('Imported screen')
  })

  it('reopens an existing import of the same assignment without overwriting student work', async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-source-'))
    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-destination-'))
    temporaryDirectories.push(source, destination)
    await fs.mkdir(path.join(source, 'src'))
    await fs.writeFile(path.join(source, 'src', 'screen.tsx'), 'export const screen = true\n')
    await saveAssignment(source, {
      title: 'Existing assignment', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'screen', title: 'Screen', description: 'Complete it.', filePath: 'src/screen.tsx', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'learning-gated', passingScore: 80, allowGeneration: true },
      evidencePolicy: { includeAiActivity: true, includeFileSnapshots: true }
    })
    const assignmentPackage = await createAssignmentPackage(source)
    const packagePath = path.join(destination, 'assignment.wormie-package.json')
    await fs.writeFile(packagePath, assignmentPackage.payload)
    const firstImport = await importAssignmentPackage(packagePath, destination)
    await fs.writeFile(path.join(firstImport.rootPath, 'src', 'screen.tsx'), 'export const studentWork = true\n')

    const reopened = await importAssignmentPackage(packagePath, destination)

    expect(reopened.rootPath).toBe(firstImport.rootPath)
    expect(await fs.readFile(path.join(reopened.rootPath, 'src', 'screen.tsx'), 'utf8')).toContain('studentWork = true')
  })

  it('imports teacher review workspaces without a student marker', async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-source-'))
    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-destination-'))
    temporaryDirectories.push(source, destination)
    await fs.writeFile(path.join(source, 'task.ts'), 'export const task = true\n')
    await saveAssignment(source, {
      title: 'Teacher review', summary: 'Review it.', instructions: 'Read first.',
      tasks: [{ id: 'task', title: 'Task', description: 'Complete it.', filePath: 'task.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'disabled', passingScore: 80, allowGeneration: false },
      evidencePolicy: { includeAiActivity: false, includeFileSnapshots: true }
    })
    const assignmentPackage = await createAssignmentPackage(source)
    const packagePath = path.join(destination, 'assignment.wormie-package.json')
    await fs.writeFile(packagePath, assignmentPackage.payload)

    const imported = await importAssignmentPackage(packagePath, destination, 'teacher')

    expect(JSON.parse(await fs.readFile(path.join(imported.rootPath, '.wormie', 'teacher.json'), 'utf8'))).toMatchObject({
      schemaVersion: 1,
      packageId: assignmentPackage.value.id
    })
    await expect(fs.stat(path.join(imported.rootPath, '.wormie', 'student.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('upgrades a matching workspace imported by the old teacher path', async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-source-'))
    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-destination-'))
    temporaryDirectories.push(source, destination)
    await fs.writeFile(path.join(source, 'task.ts'), 'export const task = true\n')
    await saveAssignment(source, {
      title: 'Teacher migration', summary: 'Review it.', instructions: 'Read first.',
      tasks: [{ id: 'task', title: 'Task', description: 'Complete it.', filePath: 'task.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'disabled', passingScore: 80, allowGeneration: false },
      evidencePolicy: { includeAiActivity: false, includeFileSnapshots: true }
    })
    const assignmentPackage = await createAssignmentPackage(source)
    const packagePath = path.join(destination, 'assignment.wormie-package.json')
    await fs.writeFile(packagePath, assignmentPackage.payload)
    const oldImport = await importAssignmentPackage(packagePath, destination)
    await fs.writeFile(path.join(oldImport.rootPath, 'task.ts'), 'export const preserved = true\n')

    const reopened = await importAssignmentPackage(packagePath, destination, 'teacher')

    expect(reopened.rootPath).toBe(oldImport.rootPath)
    expect(await fs.readFile(path.join(reopened.rootPath, 'task.ts'), 'utf8')).toContain('preserved = true')
    expect(JSON.parse(await fs.readFile(path.join(reopened.rootPath, '.wormie', 'teacher.json'), 'utf8'))).toMatchObject({ packageId: assignmentPackage.value.id })
    await expect(fs.stat(path.join(reopened.rootPath, '.wormie', 'student.json'))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('does not reuse or remove an unrelated folder with the same assignment name', async () => {
    const source = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-source-'))
    const destination = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-destination-'))
    temporaryDirectories.push(source, destination)
    await fs.writeFile(path.join(source, 'task.ts'), 'export {}\n')
    await saveAssignment(source, {
      title: 'Name collision', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'task', title: 'Task', description: 'Complete it.', filePath: 'task.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'disabled', passingScore: 80, allowGeneration: false },
      evidencePolicy: { includeAiActivity: false, includeFileSnapshots: false }
    })
    const assignmentPackage = await createAssignmentPackage(source)
    const packagePath = path.join(destination, 'assignment.wormie-package.json')
    await fs.writeFile(packagePath, assignmentPackage.payload)
    const collisionPath = path.join(destination, 'Name collision - assignment')
    await fs.mkdir(collisionPath)
    await fs.writeFile(path.join(collisionPath, 'keep.txt'), 'keep me')

    await expect(importAssignmentPackage(packagePath, destination)).rejects.toThrow('different folder')
    expect(await fs.readFile(path.join(collisionPath, 'keep.txt'), 'utf8')).toBe('keep me')
  })

  it('refuses to export when a required task file is protected from packaging', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-'))
    temporaryDirectories.push(workspace)
    await fs.writeFile(path.join(workspace, 'config.json'), '{}\n')
    await saveAssignment(workspace, {
      title: 'Protected task', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'config', title: 'Config', description: 'Complete it.', filePath: 'config.json', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'disabled', passingScore: 80, allowGeneration: false },
      evidencePolicy: { includeAiActivity: false, includeFileSnapshots: false }
    })

    await expect(createAssignmentPackage(workspace)).rejects.toThrow('cannot be included')
  })

  it('bounds starter-file reads before creating a package', async () => {
    const workspace = await fs.mkdtemp(path.join(os.tmpdir(), 'wormie-package-'))
    temporaryDirectories.push(workspace)
    await fs.writeFile(path.join(workspace, 'large.bin'), Buffer.alloc(2 * 1024 * 1024 + 1))
    await fs.writeFile(path.join(workspace, 'task.ts'), 'export {}\n')
    await saveAssignment(workspace, {
      title: 'Bounded package', summary: 'Complete it.', instructions: 'Read first.',
      tasks: [{ id: 'task', title: 'Task', description: 'Complete it.', filePath: 'task.ts', kind: 'implement', acceptanceCriteria: ['It works.'] }],
      aiPolicy: { mode: 'disabled', passingScore: 80, allowGeneration: false },
      evidencePolicy: { includeAiActivity: false, includeFileSnapshots: false }
    })

    await expect(createAssignmentPackage(workspace)).rejects.toThrow('larger than 2 MB')
  })
})
