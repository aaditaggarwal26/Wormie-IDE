import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  IPC_CHANNELS,
  type Classroom,
  type ClassroomCreateRequest,
  type ClassroomMasterySummary,
  type ClassroomOpenAssignmentResult,
  type ClassroomPublishRequest,
  type CloudAuthCredentials,
  type CloudAuthState,
  type CloudAuthUpdate,
  type WorkspaceSnapshot
} from '../../shared/contracts'
import { createAssignmentPackage, importAssignmentPackage } from '../assignments/package'
import { assignmentBucket, supabasePublishableKey, supabaseUrl } from './config'
import { inviteCodeFrom } from './invite'
import { authCallbackUrl, type AuthCallback } from './oauth'
import { SecureAuthStorage } from './secureAuthStorage'
import type { MasteryRepository } from '../mastery/repository'
import { MasterySyncCoordinator } from '../mastery/sync'

const maxCloudPackageBytes = 40 * 1024 * 1024
const credentialsSchema = z.object({
  email: z.email().max(320).transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128)
}).strict()
const emailSchema = z.email().max(320).transform((value) => value.trim().toLowerCase())
const passwordSchema = z.string().min(8).max(128)
const createClassroomSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000)
}).strict()
const publishSchema = z.object({
  classroomId: z.uuid(),
  workspaceRoot: z.string().min(1).max(4096)
}).strict()
const classroomRowSchema = z.object({
  id: z.uuid(), name: z.string(), description: z.string(), owner_id: z.uuid(), created_at: z.string()
})
const memberRowSchema = z.object({
  classroom_id: z.uuid(), user_id: z.uuid(), role: z.enum(['teacher', 'student']), joined_at: z.string()
})
const inviteRowSchema = z.object({ classroom_id: z.uuid(), code: z.string().regex(/^[a-f0-9]{32}$/) })
const profileRowSchema = z.object({ id: z.uuid(), display_name: z.string() })
const assignmentRowSchema = z.object({
  id: z.uuid(), classroom_id: z.uuid(), local_assignment_id: z.uuid(), title: z.string(), summary: z.string(),
  published_at: z.string(), published_by: z.uuid()
})
const downloadableAssignmentSchema = z.object({ id: z.uuid(), title: z.string(), package_path: z.string(), package_sha256: z.string().regex(/^[a-f0-9]{64}$/) })
const masterySummaryRowSchema = z.object({
  classroom_id: z.uuid(),
  user_id: z.uuid(),
  display_name: z.string(),
  assessed_concepts: z.number().int().min(0),
  overall_mastery: z.number().nullable(),
  review_due_concepts: z.number().int().min(0),
  weak_concepts: z.array(z.object({ conceptId: z.string(), name: z.string(), mastery: z.number() })).default([]),
  strong_concepts: z.array(z.object({ conceptId: z.string(), name: z.string(), mastery: z.number() })).default([]),
  updated_at: z.string()
})

function cleanError(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message)
  }
  return new Error(fallback)
}

function authError(error: unknown, action: 'sign-in' | 'sign-up'): Error {
  const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string' ? error.code : null
  if (code === 'invalid_credentials') {
    return new Error("We couldn't sign you in. Check your email and password, or create an account first.")
  }
  if (code === 'email_not_confirmed') {
    return new Error('Confirm your email address before signing in.')
  }
  if (code === 'user_already_exists' || code === 'email_exists') {
    return new Error('An account already exists for this email. Sign in instead.')
  }
  if (code === 'weak_password') {
    return new Error('Choose a stronger password and try again.')
  }
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') {
    return new Error('Too many account attempts. Wait a moment, then try again.')
  }
  if (code === 'signup_disabled') {
    return new Error('New account creation is currently unavailable.')
  }
  return cleanError(error, action === 'sign-in' ? 'Could not sign in.' : 'Could not create your account.')
}

function authState(user: { id: string; email?: string | null } | null, emailConfirmationRequired = false, passwordResetRequired = false): CloudAuthState {
  return {
    user: user?.email ? { id: user.id, email: user.email } : null,
    ...(emailConfirmationRequired ? { emailConfirmationRequired: true } : {}),
    ...(passwordResetRequired ? { passwordResetRequired: true } : {})
  }
}

function samePath(left: string, right: string): boolean {
  const normalize = (value: string) => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value)
  return normalize(left) === normalize(right)
}

export function registerCloudHandlers(
  getWorkspaceRoot: () => string | null,
  setWorkspace: (rootPath: string) => Promise<WorkspaceSnapshot>,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  takePendingInvite: () => string | null,
  notifyAuthChanged: (update: CloudAuthUpdate) => void,
  masteryRepository?: MasteryRepository
): { handleAuthCallback: (callback: AuthCallback) => Promise<void> } {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
      storage: new SecureAuthStorage()
    }
  })
  const masterySync = masteryRepository ? new MasterySyncCoordinator(masteryRepository, client as never) : null
  let callbackExchange = Promise.resolve()
  let passwordRecoveryEvent = false
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryEvent = true
  })

  function assertTrusted(event: IpcMainInvokeEvent): void {
    if (!isTrustedSender(event)) throw new Error('Cloud access was denied for this window.')
  }

  async function requireUser(): Promise<{ id: string; email: string }> {
    const { data, error } = await client.auth.getUser()
    if (error || !data.user?.email) throw new Error('Sign in to use classrooms.')
    return { id: data.user.id, email: data.user.email }
  }

  async function listClassrooms(): Promise<Classroom[]> {
    const currentUser = await requireUser()
    const [classroomsResult, membersResult, invitesResult, assignmentsResult] = await Promise.all([
      client.from('classrooms').select('id,name,description,owner_id,created_at').order('created_at'),
      client.from('classroom_members').select('classroom_id,user_id,role,joined_at'),
      client.from('classroom_invites').select('classroom_id,code').is('revoked_at', null),
      client.from('classroom_assignments').select('id,classroom_id,local_assignment_id,title,summary,published_at,published_by').order('published_at', { ascending: false })
    ])
    for (const result of [classroomsResult, membersResult, invitesResult, assignmentsResult]) {
      if (result.error) throw cleanError(result.error, 'Could not load classrooms.')
    }

    const classroomRows = z.array(classroomRowSchema).parse(classroomsResult.data ?? [])
    const memberRows = z.array(memberRowSchema).parse(membersResult.data ?? [])
    const inviteRows = z.array(inviteRowSchema).parse(invitesResult.data ?? [])
    const assignmentRows = z.array(assignmentRowSchema).parse(assignmentsResult.data ?? [])
    const userIds = [...new Set(memberRows.map((member) => member.user_id))]
    let profileRows: z.infer<typeof profileRowSchema>[] = []
    if (userIds.length > 0) {
      const profilesResult = await client.from('profiles').select('id,display_name').in('id', userIds)
      if (profilesResult.error) throw cleanError(profilesResult.error, 'Could not load classroom members.')
      profileRows = z.array(profileRowSchema).parse(profilesResult.data ?? [])
    }
    const profiles = new Map(profileRows.map((profile) => [profile.id, profile]))
    const invites = new Map(inviteRows.map((invite) => [invite.classroom_id, invite.code]))

    return classroomRows.map((classroom) => {
      const members = memberRows
        .filter((member) => member.classroom_id === classroom.id)
        .map((member) => {
          const profile = profiles.get(member.user_id)
          return {
            userId: member.user_id,
            email: member.user_id === currentUser.id ? currentUser.email : null,
            displayName: profile?.display_name ?? 'Wormie user',
            role: member.role,
            joinedAt: member.joined_at
          }
        })
        .sort((left, right) => left.role.localeCompare(right.role) || left.displayName.localeCompare(right.displayName))
      const role = memberRows.find((member) => member.classroom_id === classroom.id && member.user_id === currentUser.id)?.role ?? 'student'
      const code = invites.get(classroom.id) ?? null
      return {
        id: classroom.id,
        name: classroom.name,
        description: classroom.description,
        ownerId: classroom.owner_id,
        role,
        inviteCode: role === 'teacher' ? code : null,
        inviteLink: role === 'teacher' && code ? `wormie://join/${code}` : null,
        createdAt: classroom.created_at,
        members,
        assignments: assignmentRows
          .filter((assignment) => assignment.classroom_id === classroom.id)
          .map((assignment) => ({
            id: assignment.id,
            localAssignmentId: assignment.local_assignment_id,
            title: assignment.title,
            summary: assignment.summary,
            publishedAt: assignment.published_at,
            publishedBy: assignment.published_by
          }))
      }
    })
  }

  ipcMain.handle(IPC_CHANNELS.cloudGetAuth, async (event): Promise<CloudAuthState> => {
    assertTrusted(event)
    await callbackExchange
    const { data, error } = await client.auth.getSession()
    if (error) throw cleanError(error, 'Could not restore your account session.')
    if (data.session?.user) await masterySync?.syncUser(data.session.user)
    return authState(data.session?.user ?? null)
  })

  ipcMain.handle(IPC_CHANNELS.cloudGetPendingInvite, (event): string | null => {
    assertTrusted(event)
    return takePendingInvite()
  })

  ipcMain.handle(IPC_CHANNELS.cloudSignUp, async (event, input: CloudAuthCredentials): Promise<CloudAuthState> => {
    assertTrusted(event)
    const credentials = credentialsSchema.parse(input)
    const { data, error } = await client.auth.signUp({
      email: credentials.email,
      password: credentials.password,
      options: {
        data: { display_name: credentials.email.split('@')[0] },
        emailRedirectTo: authCallbackUrl
      }
    })
    if (error) throw authError(error, 'sign-up')
    if (data.session?.user) await masterySync?.syncUser(data.session.user)
    return authState(data.session?.user ?? null, Boolean(data.user && !data.session))
  })

  ipcMain.handle(IPC_CHANNELS.cloudSignIn, async (event, input: CloudAuthCredentials): Promise<CloudAuthState> => {
    assertTrusted(event)
    const credentials = credentialsSchema.parse(input)
    const { data, error } = await client.auth.signInWithPassword(credentials)
    if (error) throw authError(error, 'sign-in')
    await masterySync?.syncUser(data.user)
    return authState(data.user)
  })

  ipcMain.handle(IPC_CHANNELS.cloudRequestPasswordReset, async (event, input: string): Promise<void> => {
    assertTrusted(event)
    const { error } = await client.auth.resetPasswordForEmail(emailSchema.parse(input), { redirectTo: authCallbackUrl })
    if (error) throw authError(error, 'sign-in')
  })

  ipcMain.handle(IPC_CHANNELS.cloudUpdatePassword, async (event, input: string): Promise<CloudAuthState> => {
    assertTrusted(event)
    const { data, error } = await client.auth.updateUser({ password: passwordSchema.parse(input) })
    if (error) throw authError(error, 'sign-in')
    return authState(data.user)
  })

  ipcMain.handle(IPC_CHANNELS.cloudSignInWithGoogle, async (event): Promise<void> => {
    assertTrusted(event)
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: authCallbackUrl,
        skipBrowserRedirect: true
      }
    })
    if (error) throw authError(error, 'sign-in')
    if (!data.url) throw new Error('Could not start Google sign-in.')

    const authorizationUrl = new URL(data.url)
    const projectUrl = new URL(supabaseUrl)
    if (
      authorizationUrl.protocol !== 'https:' ||
      authorizationUrl.hostname !== projectUrl.hostname ||
      authorizationUrl.pathname !== '/auth/v1/authorize' ||
      authorizationUrl.username ||
      authorizationUrl.password
    ) throw new Error('Supabase returned an invalid Google sign-in address.')

    await shell.openExternal(authorizationUrl.toString())
  })

  ipcMain.handle(IPC_CHANNELS.cloudSignOut, async (event): Promise<void> => {
    assertTrusted(event)
    const { error } = await client.auth.signOut()
    if (error) throw cleanError(error, 'Could not sign out.')
  })

  ipcMain.handle(IPC_CHANNELS.cloudListClassrooms, async (event): Promise<Classroom[]> => {
    assertTrusted(event)
    const user = await requireUser()
    await masterySync?.syncUser(user)
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudClassroomMasterySummaries, async (event, classroomId: string): Promise<ClassroomMasterySummary[]> => {
    assertTrusted(event)
    const id = z.uuid().parse(classroomId)
    const user = await requireUser()
    await masterySync?.syncUser(user)
    const result = await client.from('classroom_mastery_summaries').select('classroom_id,user_id,display_name,assessed_concepts,overall_mastery,review_due_concepts,weak_concepts,strong_concepts,updated_at').eq('classroom_id', id)
    if (result.error) throw cleanError(result.error, 'Could not load classroom mastery summaries.')
    return z.array(masterySummaryRowSchema).parse(result.data ?? []).map((row) => ({
      classroomId: row.classroom_id,
      userId: row.user_id,
      displayName: row.display_name,
      assessedConcepts: row.assessed_concepts,
      overallMastery: row.overall_mastery,
      reviewDueConcepts: row.review_due_concepts,
      weakConcepts: row.weak_concepts,
      strongConcepts: row.strong_concepts,
      updatedAt: row.updated_at
    }))
  })

  ipcMain.handle(IPC_CHANNELS.cloudCreateClassroom, async (event, input: ClassroomCreateRequest): Promise<Classroom[]> => {
    assertTrusted(event)
    const request = createClassroomSchema.parse(input)
    await requireUser()
    const { error } = await client.rpc('create_classroom', {
      classroom_name: request.name,
      classroom_description: request.description
    })
    if (error) throw cleanError(error, 'Could not create the classroom.')
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudJoinClassroom, async (event, invite: string): Promise<Classroom[]> => {
    assertTrusted(event)
    await requireUser()
    const { error } = await client.rpc('join_classroom', { invite_code: inviteCodeFrom(invite) })
    if (error) throw cleanError(error, 'Could not join the classroom.')
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudRotateInvite, async (event, classroomId: string): Promise<Classroom[]> => {
    assertTrusted(event)
    const id = z.uuid().parse(classroomId)
    await requireUser()
    const { error } = await client.rpc('rotate_classroom_invite', { target_classroom_id: id })
    if (error) throw cleanError(error, 'Could not replace the classroom invitation.')
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudCopyInvite, (event, inviteLink: string): void => {
    assertTrusted(event)
    if (!/^wormie:\/\/join\/[a-f0-9]{32}$/.test(inviteLink)) throw new Error('The classroom invitation is invalid.')
    clipboard.writeText(inviteLink)
  })

  ipcMain.handle(IPC_CHANNELS.cloudPublishAssignment, async (event, input: ClassroomPublishRequest): Promise<Classroom[]> => {
    assertTrusted(event)
    const request = publishSchema.parse(input)
    const activeRoot = getWorkspaceRoot()
    if (!activeRoot || !samePath(activeRoot, request.workspaceRoot)) throw new Error('The active workspace changed. Open the assignment again before publishing.')
    const user = await requireUser()
    const assignmentPackage = await createAssignmentPackage(activeRoot)
    const cloudAssignmentId = randomUUID()
    const packagePath = `${request.classroomId}/${cloudAssignmentId}/package.json`
    const packageSha256 = createHash('sha256').update(assignmentPackage.payload).digest('hex')
    const payload = new Blob([assignmentPackage.payload], { type: 'application/json' })
    const upload = await client.storage.from(assignmentBucket).upload(packagePath, payload, {
      contentType: 'application/json',
      upsert: false
    })
    if (upload.error) throw cleanError(upload.error, 'Could not upload the assignment project.')

    const manifest = assignmentPackage.value.assignment
    const insert = await client.from('classroom_assignments').insert({
      id: cloudAssignmentId,
      classroom_id: request.classroomId,
      local_assignment_id: manifest.id,
      title: manifest.title,
      summary: manifest.summary,
      manifest,
      manifest_revision: assignmentPackage.assignmentRevision,
      package_sha256: packageSha256,
      package_path: packagePath,
      published_by: user.id
    })
    if (insert.error) {
      await client.storage.from(assignmentBucket).remove([packagePath])
      throw cleanError(insert.error, 'Could not publish the assignment.')
    }
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudOpenAssignment, async (event, assignmentId: string): Promise<ClassroomOpenAssignmentResult | null> => {
    assertTrusted(event)
    const id = z.uuid().parse(assignmentId)
    await requireUser()
    const assignmentResult = await client.from('classroom_assignments').select('id,title,package_path,package_sha256').eq('id', id).single()
    if (assignmentResult.error) throw cleanError(assignmentResult.error, 'Could not find the assignment.')
    const assignment = downloadableAssignmentSchema.parse(assignmentResult.data)
    const destination = await dialog.showOpenDialog({
      title: 'Choose where to create the assignment project',
      properties: ['openDirectory', 'createDirectory']
    })
    if (destination.canceled || !destination.filePaths[0]) return null

    const download = await client.storage.from(assignmentBucket).download(assignment.package_path)
    if (download.error) throw cleanError(download.error, 'Could not download the assignment project.')
    if (download.data.size > maxCloudPackageBytes) throw new Error('The classroom assignment package is larger than 40 MB.')

    const temporaryDirectory = await fs.mkdtemp(path.join(app.getPath('temp'), 'wormie-assignment-'))
    const temporaryPath = path.join(temporaryDirectory, 'package.json')
    try {
      const packageBuffer = Buffer.from(await download.data.arrayBuffer())
      if (createHash('sha256').update(packageBuffer).digest('hex') !== assignment.package_sha256) {
        throw new Error('The classroom assignment failed its integrity check.')
      }
      await fs.writeFile(temporaryPath, packageBuffer, { flag: 'wx' })
      const imported = await importAssignmentPackage(temporaryPath, destination.filePaths[0])
      return {
        workspace: await setWorkspace(imported.rootPath),
        assignmentTitle: imported.assignmentTitle,
        fileCount: imported.fileCount
      }
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  return {
    handleAuthCallback: (callback) => {
      callbackExchange = callbackExchange.then(async () => {
        try {
          if (callback.kind === 'error') {
            notifyAuthChanged({ auth: null, error: 'This sign-in or confirmation link could not be completed. Request a new link and try again.' })
            return
          }
          passwordRecoveryEvent = false
          const { data, error } = await client.auth.exchangeCodeForSession(callback.code)
          if (error) {
            notifyAuthChanged({ auth: null, error: authError(error, 'sign-in').message })
            return
          }
          notifyAuthChanged({ auth: authState(data.user, false, passwordRecoveryEvent), error: null })
        } catch (error) {
          notifyAuthChanged({ auth: null, error: authError(error, 'sign-in').message })
        }
      })
      return callbackExchange
    }
  }
}
