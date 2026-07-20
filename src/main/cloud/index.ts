import { createHash, randomUUID } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { app, clipboard, dialog, ipcMain, shell, type IpcMainInvokeEvent } from 'electron'
import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'
import {
  IPC_CHANNELS,
  type Classroom,
  type ClassroomAssignmentContext,
  type ClassroomCreateRequest,
  type ClassroomUpdateRequest,
  type ClassroomOpenAssignmentResult,
  type ClassroomMasterySnapshot,
  type ClassroomPublishRequest,
  type CloudAuthCredentials,
  type CloudAuthState,
  type CloudAuthUpdate,
  type WorkspaceSnapshot,
  type WorkspacePurpose
} from '../../shared/contracts'
import { createAssignmentPackage, importAssignmentPackage } from '../assignments/package'
import { assignmentBucket, supabasePublishableKey, supabaseUrl } from './config'
import { inviteCodeFrom } from './invite'
import { authCallback, authCallbackUrl, authTokensFromLink, passwordResetCallbackUrl, type AuthCallback } from './oauth'
import { SecureAuthStorage } from './secureAuthStorage'
import { MasterySyncQueue, type MasterySyncEvent } from './masterySync'
import { classroomUpdateSchema } from './classroomDetails'
import type { UnderstandingCompletion } from '../understanding/gate'

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
const visibleMemberRowSchema = memberRowSchema.extend({
  email: z.string().email().nullable(),
  display_name: z.string()
})
const inviteRowSchema = z.object({ classroom_id: z.uuid(), code: z.string().regex(/^[a-f0-9]{32}$/) })
const profileRowSchema = z.object({ id: z.uuid(), display_name: z.string() })
const assignmentRowSchema = z.object({
  id: z.uuid(), classroom_id: z.uuid(), local_assignment_id: z.uuid(), title: z.string(), summary: z.string(),
  published_at: z.string(), published_by: z.uuid()
})
const downloadableAssignmentSchema = z.object({ id: z.uuid(), classroom_id: z.uuid(), title: z.string(), package_path: z.string(), package_sha256: z.string().regex(/^[a-f0-9]{64}$/) })
const masteryRowSchema = z.object({ classroom_id: z.uuid(), student_id: z.uuid(), concept_id: z.string(), concept_name: z.string(), mastery: z.number(), attempts: z.number(), correct: z.number(), updated_at: z.string() })
const masteryEventRowSchema = z.object({ student_id: z.uuid(), assignment_id: z.uuid().nullable(), quiz_id: z.uuid(), attempt: z.number(), score: z.number(), passed: z.boolean(), title: z.string(), completed_at: z.string() })

function cleanError(error: unknown, fallback: string): Error {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return new Error(error.message)
  }
  return new Error(fallback)
}

function isMissingRosterRpc(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && 'code' in error && (error.code === 'PGRST202' || error.code === '42883'))
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
  setWorkspace: (rootPath: string, isCurrent?: () => boolean) => Promise<WorkspaceSnapshot>,
  getWorkspacePurpose: () => WorkspacePurpose,
  setAssignmentContext: (context: (ClassroomAssignmentContext & { userId: string }) | null) => void,
  masteryQueue: MasterySyncQueue,
  isTrustedSender: (event: IpcMainInvokeEvent) => boolean,
  takePendingInvite: () => string | null,
  notifyAuthChanged: (update: CloudAuthUpdate) => void
): { handleAuthCallback: (callback: AuthCallback) => Promise<void>; recordUnderstandingCompletion: (completion: UnderstandingCompletion) => void } {
  const client = createClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
      persistSession: true,
      storage: new SecureAuthStorage()
    }
  })
  let callbackExchange = Promise.resolve()
  let passwordRecoveryEvent = false
  client.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') passwordRecoveryEvent = true
  })

  function queueSessionUpdate(run: () => Promise<CloudAuthUpdate>): Promise<void> {
    callbackExchange = callbackExchange.then(async () => {
      try {
        notifyAuthChanged(await run())
      } catch (error) {
        notifyAuthChanged({ auth: null, error: authError(error, 'sign-in').message })
      }
    })
    return callbackExchange
  }

  // The link inside a Supabase email is the `/auth/v1/verify` endpoint, which
  // 302-redirects to `redirect_to` with the session appended (`?code=...` for
  // PKCE, `#access_token=...` for implicit). Resolving that redirect here lets
  // the user paste the raw email link instead of the post-redirect URL. Scoped
  // strictly to this project's verify endpoint so a pasted link can't make us
  // fetch an arbitrary host.
  async function resolveVerifyLink(link: string): Promise<string | null> {
    let url: URL
    try { url = new URL(link) } catch { return null }
    const project = new URL(supabaseUrl)
    if (url.protocol !== 'https:' || url.hostname !== project.hostname || url.pathname !== '/auth/v1/verify') return null
    const response = await fetch(url, { redirect: 'manual' })
    return response.headers.get('location')
  }

  function processAuthCallback(callback: AuthCallback): Promise<void> {
    return queueSessionUpdate(async () => {
      if (callback.kind === 'error') {
        return { auth: null, error: 'This sign-in or confirmation link could not be completed. Request a new link and try again.' }
      }
      passwordRecoveryEvent = false
      const { data, error } = await client.auth.exchangeCodeForSession(callback.code)
      if (error) return { auth: null, error: authError(error, 'sign-in').message }
      return { auth: authState(data.user, false, callback.recovery || passwordRecoveryEvent), error: null }
    })
  }

  function assertTrusted(event: IpcMainInvokeEvent): void {
    if (!isTrustedSender(event)) throw new Error('Cloud access was denied for this window.')
  }

  async function requireUser(): Promise<{ id: string; email: string }> {
    const { data, error } = await client.auth.getUser()
    if (error || !data.user?.email) throw new Error('Sign in to use classrooms.')
    return { id: data.user.id, email: data.user.email }
  }

  async function sendMasteryEvent(event: MasterySyncEvent): Promise<void> {
    const user = await requireUser()
    if (user.id !== event.studentId) throw new Error('The mastery event belongs to a different account.')
    const { error } = await client.rpc('record_classroom_mastery_event', { event_payload: event })
    if (error) throw cleanError(error, 'Could not synchronize classroom mastery.')
  }

  function recordUnderstandingCompletion(completion: UnderstandingCompletion): void {
    const conceptIds = new Set(completion.quiz.concepts.map((concept) => concept.id))
    masteryQueue.enqueue({
      eventKey: `${completion.scope.classroomId}:${completion.scope.userId}:${completion.quiz.id}:${completion.result.attempt}`,
      classroomId: completion.scope.classroomId,
      studentId: completion.scope.userId,
      assignmentId: completion.scope.assignmentId,
      quizId: completion.quiz.id,
      attempt: completion.result.attempt,
      score: completion.result.score,
      passed: completion.result.passed,
      source: completion.quiz.source,
      title: completion.quiz.title,
      completedAt: completion.completedAt,
      concepts: completion.mastery.filter((concept) => conceptIds.has(concept.conceptId)).map((concept) => ({
        conceptId: concept.conceptId,
        name: concept.name,
        mastery: concept.mastery,
        attempts: concept.attempts,
        correct: concept.correct,
        updatedAt: concept.updatedAt
      }))
    })
    void masteryQueue.flush(sendMasteryEvent)
  }

  async function listClassrooms(): Promise<Classroom[]> {
    const currentUser = await requireUser()
    await masteryQueue.flush(sendMasteryEvent)
    const [classroomsResult, membersResult, invitesResult, assignmentsResult, visibleMembersResult] = await Promise.all([
      client.from('classrooms').select('id,name,description,owner_id,created_at').order('created_at'),
      client.from('classroom_members').select('classroom_id,user_id,role,joined_at'),
      client.from('classroom_invites').select('classroom_id,code').is('revoked_at', null),
      client.from('classroom_assignments').select('id,classroom_id,local_assignment_id,title,summary,published_at,published_by').order('published_at', { ascending: false }),
      client.rpc('list_visible_classroom_members')
    ])
    for (const result of [classroomsResult, membersResult, invitesResult, assignmentsResult]) {
      if (result.error) throw cleanError(result.error, 'Could not load classrooms.')
    }

    const classroomRows = z.array(classroomRowSchema).parse(classroomsResult.data ?? [])
    const memberRows = z.array(memberRowSchema).parse(membersResult.data ?? [])
    const inviteRows = z.array(inviteRowSchema).parse(invitesResult.data ?? [])
    const assignmentRows = z.array(assignmentRowSchema).parse(assignmentsResult.data ?? [])
    if (visibleMembersResult.error && !isMissingRosterRpc(visibleMembersResult.error)) {
      throw cleanError(visibleMembersResult.error, 'Could not load classroom members.')
    }
    const visibleMemberRows = visibleMembersResult.error
      ? null
      : z.array(visibleMemberRowSchema).parse(visibleMembersResult.data ?? [])
    const userIds = [...new Set(memberRows.map((member) => member.user_id))]
    let profileRows: z.infer<typeof profileRowSchema>[] = []
    if (!visibleMemberRows && userIds.length > 0) {
      const profilesResult = await client.from('profiles').select('id,display_name').in('id', userIds)
      if (profilesResult.error) throw cleanError(profilesResult.error, 'Could not load classroom members.')
      profileRows = z.array(profileRowSchema).parse(profilesResult.data ?? [])
    }
    const profiles = new Map(profileRows.map((profile) => [profile.id, profile]))
    const invites = new Map(inviteRows.map((invite) => [invite.classroom_id, invite.code]))

    return classroomRows.map((classroom) => {
      const members = (visibleMemberRows
        ? visibleMemberRows.filter((member) => member.classroom_id === classroom.id).map((member) => ({
          userId: member.user_id,
          email: member.email,
          displayName: member.display_name,
          role: member.role,
          joinedAt: member.joined_at
        }))
        : memberRows.filter((member) => member.classroom_id === classroom.id).map((member) => ({
          userId: member.user_id,
          email: member.user_id === currentUser.id ? currentUser.email : null,
          displayName: profiles.get(member.user_id)?.display_name ?? 'Wormie user',
          role: member.role,
          joinedAt: member.joined_at
        })))
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
    return authState(data.session?.user ?? null, Boolean(data.user && !data.session))
  })

  ipcMain.handle(IPC_CHANNELS.cloudSignIn, async (event, input: CloudAuthCredentials): Promise<CloudAuthState> => {
    assertTrusted(event)
    const credentials = credentialsSchema.parse(input)
    const { data, error } = await client.auth.signInWithPassword(credentials)
    if (error) throw authError(error, 'sign-in')
    return authState(data.user)
  })

  ipcMain.handle(IPC_CHANNELS.cloudRequestPasswordReset, async (event, input: string): Promise<void> => {
    assertTrusted(event)
    const { error } = await client.auth.resetPasswordForEmail(emailSchema.parse(input), { redirectTo: passwordResetCallbackUrl })
    if (error) throw authError(error, 'sign-in')
  })

  ipcMain.handle(IPC_CHANNELS.cloudSubmitAuthLink, async (event, input: unknown): Promise<void> => {
    assertTrusted(event)
    const link = z.string().max(8192).parse(input).trim()
    // A raw email link points at Supabase's verify endpoint; follow its redirect
    // to reach the actual callback (with code or tokens). Fall back to the pasted
    // link itself if it's already a callback / address-bar URL.
    const resolved = (await resolveVerifyLink(link)) ?? link
    const callback = authCallback(resolved)
    if (callback) {
      await processAuthCallback(callback)
      return
    }
    const tokens = authTokensFromLink(resolved)
    if (!tokens) throw new Error("That doesn't look like a Wormie sign-in link. Copy the full link from your email (or the address bar URL it opened) and paste it here.")
    await queueSessionUpdate(async () => {
      const { data, error } = await client.auth.setSession({ access_token: tokens.accessToken, refresh_token: tokens.refreshToken })
      if (error) return { auth: null, error: authError(error, 'sign-in').message }
      return { auth: authState(data.user, false, tokens.recovery), error: null }
    })
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
    await requireUser()
    return listClassrooms()
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

  ipcMain.handle(IPC_CHANNELS.cloudUpdateClassroom, async (event, input: ClassroomUpdateRequest): Promise<Classroom[]> => {
    assertTrusted(event)
    const request = classroomUpdateSchema.parse(input)
    await requireUser()
    const { error } = await client.from('classrooms')
      .update({ name: request.name, description: request.description })
      .eq('id', request.classroomId)
      .select('id')
      .single()
    if (error) throw cleanError(error, 'Could not update the classroom. Only its teacher can change these details.')
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudAddStudent, async (event, classroomId: string, email: string): Promise<Classroom[]> => {
    assertTrusted(event)
    const id = z.uuid().parse(classroomId)
    const normalizedEmail = emailSchema.parse(email)
    await requireUser()
    const { data, error } = await client.rpc('add_classroom_student_by_email', {
      student_email: normalizedEmail,
      target_classroom_id: id
    })
    if (error) throw cleanError(error, 'Could not add the student.')
    if (data !== true) throw new Error('No eligible account could be added. Check the email or send an invitation instead.')
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudRemoveStudent, async (event, classroomId: string, userId: string): Promise<Classroom[]> => {
    assertTrusted(event)
    const id = z.uuid().parse(classroomId)
    const studentId = z.uuid().parse(userId)
    await requireUser()
    const { data, error } = await client.rpc('remove_classroom_student', {
      student_user_id: studentId,
      target_classroom_id: id
    })
    if (error) throw cleanError(error, 'Could not remove the student.')
    if (data !== true) throw new Error('The student is no longer enrolled in this classroom.')
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudLeaveClassroom, async (event, classroomId: string): Promise<Classroom[]> => {
    assertTrusted(event)
    const id = z.uuid().parse(classroomId)
    await requireUser()
    const { data, error } = await client.rpc('leave_classroom', { target_classroom_id: id })
    if (error) throw cleanError(error, 'Could not leave the classroom.')
    if (data !== true) throw new Error('Only enrolled students can leave this classroom.')
    return listClassrooms()
  })

  ipcMain.handle(IPC_CHANNELS.cloudBeginAssignmentAuthoring, async (event, classroomId: string): Promise<ClassroomAssignmentContext> => {
    assertTrusted(event)
    const id = z.uuid().parse(classroomId)
    const user = await requireUser()
    const classroomResult = await client.from('classrooms').select('id,name,owner_id').eq('id', id).single()
    if (classroomResult.error) throw cleanError(classroomResult.error, 'Could not open the classroom for assignment authoring.')
    const classroom = z.object({ id: z.uuid(), name: z.string(), owner_id: z.uuid() }).parse(classroomResult.data)
    if (classroom.owner_id !== user.id) throw new Error('Only the classroom teacher can author assignments.')
    if (getWorkspacePurpose() !== 'assignment') throw new Error('The assignment authoring request is no longer active.')
    const context: ClassroomAssignmentContext = {
      classroomId: classroom.id,
      classroomName: classroom.name,
      assignmentId: null,
      assignmentTitle: 'Assignment authoring',
      role: 'teacher'
    }
    setAssignmentContext({ ...context, userId: user.id })
    return context
  })

  ipcMain.handle(IPC_CHANNELS.cloudListClassroomMastery, async (event, classroomId: string): Promise<ClassroomMasterySnapshot> => {
    assertTrusted(event)
    const id = z.uuid().parse(classroomId)
    await requireUser()
    await masteryQueue.flush(sendMasteryEvent)
    const [masteryResult, eventsResult] = await Promise.all([
      client.from('classroom_mastery').select('classroom_id,student_id,concept_id,concept_name,mastery,attempts,correct,updated_at').eq('classroom_id', id).order('updated_at', { ascending: false }),
      client.from('classroom_mastery_events').select('student_id,assignment_id,quiz_id,attempt,score,passed,title,completed_at').eq('classroom_id', id).order('completed_at', { ascending: false }).limit(100)
    ])
    if (masteryResult.error) throw cleanError(masteryResult.error, 'Could not load classroom mastery.')
    if (eventsResult.error) throw cleanError(eventsResult.error, 'Could not load classroom mastery activity.')
    return {
      classroomId: id,
      concepts: z.array(masteryRowSchema).parse(masteryResult.data ?? []).map((row) => ({
        studentId: row.student_id,
        conceptId: row.concept_id,
        conceptName: row.concept_name,
        mastery: row.mastery,
        attempts: row.attempts,
        correct: row.correct,
        updatedAt: row.updated_at
      })),
      events: z.array(masteryEventRowSchema).parse(eventsResult.data ?? []).map((row) => ({
        studentId: row.student_id,
        assignmentId: row.assignment_id,
        quizId: row.quiz_id,
        attempt: row.attempt,
        score: row.score,
        passed: row.passed,
        title: row.title,
        completedAt: row.completed_at
      })),
      pendingSyncCount: masteryQueue.pendingCount(id)
    }
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
    const assignmentResult = await client.from('classroom_assignments').select('id,classroom_id,title,package_path,package_sha256').eq('id', id).single()
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
      const user = await requireUser()
      const classroomResult = await client.from('classrooms').select('id,name,owner_id').eq('id', assignment.classroom_id).single()
      if (classroomResult.error) throw cleanError(classroomResult.error, 'Could not verify assignment access.')
      const classroom = z.object({ id: z.uuid(), name: z.string(), owner_id: z.uuid() }).parse(classroomResult.data)
      if (getWorkspacePurpose() !== 'assignment') throw new Error('The assignment request is no longer active.')
      const context: ClassroomAssignmentContext = {
        classroomId: classroom.id,
        classroomName: classroom.name,
        assignmentId: assignment.id,
        assignmentTitle: imported.assignmentTitle,
        role: classroom.owner_id === user.id ? 'teacher' : 'student'
      }
      setAssignmentContext({ ...context, userId: user.id })
      return {
        workspace: await setWorkspace(imported.rootPath, () => getWorkspacePurpose() === 'assignment'),
        assignmentTitle: imported.assignmentTitle,
        fileCount: imported.fileCount,
        context
      }
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true }).catch(() => undefined)
    }
  })

  return {
    recordUnderstandingCompletion,
    handleAuthCallback: processAuthCallback
  }
}
