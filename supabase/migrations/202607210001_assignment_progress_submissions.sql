create table public.classroom_assignment_progress (
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  assignment_id uuid not null references public.classroom_assignments (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  status text not null check (status in ('in-progress', 'submitted')),
  completed_tasks integer not null check (completed_tasks between 0 and 50),
  total_tasks integer not null check (total_tasks between 1 and 50),
  progress_revision uuid not null,
  started_at timestamptz not null,
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  submission_path text unique,
  submission_sha256 text,
  submission_bytes integer,
  primary key (assignment_id, student_id),
  constraint classroom_assignment_progress_task_count check (completed_tasks <= total_tasks),
  constraint classroom_assignment_progress_submission_state check (
    (status = 'in-progress' and submitted_at is null and submission_path is null and submission_sha256 is null and submission_bytes is null)
    or
    (status = 'submitted' and completed_tasks = total_tasks and submitted_at is not null and submission_path is not null
      and submission_sha256 is not null and submission_sha256 ~ '^[a-f0-9]{64}$'
      and submission_bytes is not null and submission_bytes between 1 and 16777216)
  ),
  constraint classroom_assignment_progress_submission_path check (
    submission_path is null or (
      submission_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}/submission[.]json$'
      and split_part(submission_path, '/', 1) = classroom_id::text
      and split_part(submission_path, '/', 2) = assignment_id::text
      and split_part(submission_path, '/', 3) = student_id::text
    )
  )
);

create index classroom_assignment_progress_classroom_idx
  on public.classroom_assignment_progress (classroom_id, assignment_id, updated_at desc);

create index classroom_assignment_progress_student_idx
  on public.classroom_assignment_progress (student_id, updated_at desc);

alter table public.classroom_assignment_progress enable row level security;

create policy classroom_assignment_progress_select_scope
  on public.classroom_assignment_progress for select to authenticated
  using (
    (student_id = (select auth.uid()) and public.is_classroom_member(classroom_id))
    or public.is_classroom_owner(classroom_id)
  );

revoke all on public.classroom_assignment_progress from public, anon, authenticated, service_role;
grant select on public.classroom_assignment_progress to authenticated;

create or replace function public.record_assignment_progress(event_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_classroom_id uuid := (event_payload ->> 'classroomId')::uuid;
  target_assignment_id uuid := (event_payload ->> 'assignmentId')::uuid;
  target_student_id uuid := (event_payload ->> 'studentId')::uuid;
  target_local_assignment_id uuid := (event_payload ->> 'localAssignmentId')::uuid;
  target_assignment_revision text := event_payload ->> 'assignmentRevision';
  target_progress_revision uuid := (event_payload ->> 'progressRevision')::uuid;
  target_completed_tasks integer := (event_payload ->> 'completedTasks')::integer;
  target_total_tasks integer := (event_payload ->> 'totalTasks')::integer;
  target_started_at timestamptz := (event_payload ->> 'startedAt')::timestamptz;
  expected_total_tasks integer;
  expected_local_assignment_id uuid;
  expected_assignment_revision text;
  affected_rows integer;
begin
  if (select auth.uid()) is null or target_student_id <> (select auth.uid()) then
    raise exception 'Progress may only be recorded for the signed-in student.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.classroom_members
    where classroom_id = target_classroom_id and user_id = target_student_id and role = 'student'
  ) then
    raise exception 'The student is not enrolled in this classroom.' using errcode = '42501';
  end if;
  select jsonb_array_length(assignment.manifest -> 'tasks'), assignment.local_assignment_id, assignment.manifest_revision
    into expected_total_tasks, expected_local_assignment_id, expected_assignment_revision
  from public.classroom_assignments as assignment
  where assignment.id = target_assignment_id and assignment.classroom_id = target_classroom_id;
  if expected_total_tasks is null then
    raise exception 'The assignment does not belong to this classroom.' using errcode = '22023';
  end if;
  if target_local_assignment_id is distinct from expected_local_assignment_id
    or target_assignment_revision is distinct from expected_assignment_revision
    or target_total_tasks <> expected_total_tasks or target_completed_tasks not between 0 and expected_total_tasks
    or target_started_at > now() + interval '5 minutes'
  then
    raise exception 'Invalid assignment progress.' using errcode = '22023';
  end if;

  insert into public.classroom_assignment_progress (
    classroom_id, assignment_id, student_id, status, completed_tasks, total_tasks,
    progress_revision, started_at, updated_at
  ) values (
    target_classroom_id, target_assignment_id, target_student_id, 'in-progress', target_completed_tasks,
    target_total_tasks, target_progress_revision, target_started_at, now()
  ) on conflict (assignment_id, student_id) do update set
    completed_tasks = excluded.completed_tasks,
    total_tasks = excluded.total_tasks,
    progress_revision = excluded.progress_revision,
    started_at = least(public.classroom_assignment_progress.started_at, excluded.started_at),
    updated_at = now()
  where public.classroom_assignment_progress.status <> 'submitted';
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.record_assignment_submission(event_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_classroom_id uuid := (event_payload ->> 'classroomId')::uuid;
  target_assignment_id uuid := (event_payload ->> 'assignmentId')::uuid;
  target_student_id uuid := (event_payload ->> 'studentId')::uuid;
  target_local_assignment_id uuid := (event_payload ->> 'localAssignmentId')::uuid;
  target_assignment_revision text := event_payload ->> 'assignmentRevision';
  target_progress_revision uuid := (event_payload ->> 'progressRevision')::uuid;
  target_started_at timestamptz := (event_payload ->> 'startedAt')::timestamptz;
  target_submitted_at timestamptz := (event_payload ->> 'submittedAt')::timestamptz;
  target_submission_path text := event_payload ->> 'submissionPath';
  target_submission_sha256 text := event_payload ->> 'submissionSha256';
  target_submission_bytes integer := (event_payload ->> 'submissionBytes')::integer;
  expected_total_tasks integer;
  expected_local_assignment_id uuid;
  expected_assignment_revision text;
begin
  if (select auth.uid()) is null or target_student_id <> (select auth.uid()) then
    raise exception 'Submissions may only be recorded for the signed-in student.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.classroom_members
    where classroom_id = target_classroom_id and user_id = target_student_id and role = 'student'
  ) then
    raise exception 'The student is not enrolled in this classroom.' using errcode = '42501';
  end if;
  select jsonb_array_length(assignment.manifest -> 'tasks'), assignment.local_assignment_id, assignment.manifest_revision
    into expected_total_tasks, expected_local_assignment_id, expected_assignment_revision
  from public.classroom_assignments as assignment
  where assignment.id = target_assignment_id and assignment.classroom_id = target_classroom_id;
  if expected_total_tasks is null then
    raise exception 'The assignment does not belong to this classroom.' using errcode = '22023';
  end if;
  if target_local_assignment_id is distinct from expected_local_assignment_id
    or target_assignment_revision is distinct from expected_assignment_revision
    or target_submission_path is distinct from (target_classroom_id::text || '/' || target_assignment_id::text || '/' || target_student_id::text || '/submission.json')
    or target_submission_sha256 is null or target_submission_sha256 !~ '^[a-f0-9]{64}$'
    or target_submission_bytes is null or target_submission_bytes not between 1 and 16777216
    or target_started_at > now() + interval '5 minutes'
    or target_submitted_at > now() + interval '5 minutes'
  then
    raise exception 'Invalid assignment submission.' using errcode = '22023';
  end if;

  insert into public.classroom_assignment_progress (
    classroom_id, assignment_id, student_id, status, completed_tasks, total_tasks,
    progress_revision, started_at, updated_at, submitted_at, submission_path,
    submission_sha256, submission_bytes
  ) values (
    target_classroom_id, target_assignment_id, target_student_id, 'submitted', expected_total_tasks,
    expected_total_tasks, target_progress_revision, target_started_at, now(), target_submitted_at,
    target_submission_path, target_submission_sha256, target_submission_bytes
  ) on conflict (assignment_id, student_id) do update set
    status = 'submitted',
    completed_tasks = excluded.completed_tasks,
    total_tasks = excluded.total_tasks,
    progress_revision = excluded.progress_revision,
    started_at = least(public.classroom_assignment_progress.started_at, excluded.started_at),
    updated_at = now(),
    submitted_at = excluded.submitted_at,
    submission_path = excluded.submission_path,
    submission_sha256 = excluded.submission_sha256,
    submission_bytes = excluded.submission_bytes;
  return true;
end;
$$;

create or replace function public.get_classroom_assignment_progress(target_classroom_id uuid)
returns table (
  assignment_id uuid,
  student_id uuid,
  status text,
  completed_tasks integer,
  total_tasks integer,
  started_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  submission_available boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_classroom_owner(target_classroom_id) then
    raise exception 'Only the classroom teacher can view assignment progress.' using errcode = '42501';
  end if;

  return query
  select
    assignment.id,
    member.user_id,
    coalesce(progress.status, 'not-started'),
    coalesce(progress.completed_tasks, 0),
    jsonb_array_length(assignment.manifest -> 'tasks'),
    progress.started_at,
    progress.updated_at,
    progress.submitted_at,
    progress.submission_path is not null
  from public.classroom_assignments as assignment
  join public.classroom_members as member
    on member.classroom_id = assignment.classroom_id and member.role = 'student'
  left join public.classroom_assignment_progress as progress
    on progress.assignment_id = assignment.id and progress.student_id = member.user_id
  where assignment.classroom_id = target_classroom_id
  order by assignment.published_at desc, progress.updated_at desc nulls last, member.user_id;
end;
$$;

create or replace function public.rollback_assignment_submission(event_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_classroom_id uuid := (event_payload ->> 'classroomId')::uuid;
  target_assignment_id uuid := (event_payload ->> 'assignmentId')::uuid;
  target_student_id uuid := (event_payload ->> 'studentId')::uuid;
  target_progress_revision uuid := (event_payload ->> 'progressRevision')::uuid;
  affected_rows integer;
begin
  if (select auth.uid()) is null or target_student_id <> (select auth.uid()) then
    raise exception 'Submissions may only be changed by the signed-in student.' using errcode = '42501';
  end if;
  update public.classroom_assignment_progress
  set status = 'in-progress',
      progress_revision = target_progress_revision,
      updated_at = now(),
      submitted_at = null,
      submission_path = null,
      submission_sha256 = null,
      submission_bytes = null
  where classroom_id = target_classroom_id
    and assignment_id = target_assignment_id
    and student_id = target_student_id
    and status = 'submitted';
  get diagnostics affected_rows = row_count;
  return affected_rows > 0;
end;
$$;

create or replace function public.can_write_assignment_submission(object_name text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  classroom_text text := split_part(object_name, '/', 1);
  assignment_text text := split_part(object_name, '/', 2);
  student_text text := split_part(object_name, '/', 3);
begin
  if object_name !~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/[a-f0-9-]{36}/submission[.]json$'
    or student_text <> (select auth.uid())::text
  then
    return false;
  end if;
  return exists (
    select 1
    from public.classroom_assignments as assignment
    join public.classroom_members as member on member.classroom_id = assignment.classroom_id
    where assignment.id = assignment_text::uuid
      and assignment.classroom_id = classroom_text::uuid
      and member.user_id = (select auth.uid())
      and member.role = 'student'
  );
end;
$$;

create or replace function public.can_read_assignment_submission(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_write_assignment_submission(object_name)
    or exists (
      select 1
      from public.classroom_assignment_progress as progress
      where progress.submission_path = object_name
        and public.is_classroom_owner(progress.classroom_id)
    );
$$;

revoke all on function public.record_assignment_progress(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.record_assignment_submission(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.rollback_assignment_submission(jsonb) from public, anon, authenticated, service_role;
revoke all on function public.get_classroom_assignment_progress(uuid) from public, anon, authenticated, service_role;
revoke all on function public.can_write_assignment_submission(text) from public, anon, authenticated, service_role;
revoke all on function public.can_read_assignment_submission(text) from public, anon, authenticated, service_role;
grant execute on function public.record_assignment_progress(jsonb) to authenticated;
grant execute on function public.record_assignment_submission(jsonb) to authenticated;
grant execute on function public.rollback_assignment_submission(jsonb) to authenticated;
grant execute on function public.get_classroom_assignment_progress(uuid) to authenticated;
grant execute on function public.can_write_assignment_submission(text) to authenticated;
grant execute on function public.can_read_assignment_submission(text) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-submissions', 'assignment-submissions', false, 16777216, array['application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy assignment_submissions_select_scope
  on storage.objects for select to authenticated
  using (bucket_id = 'assignment-submissions' and public.can_read_assignment_submission(name));

create policy assignment_submissions_insert_student
  on storage.objects for insert to authenticated
  with check (bucket_id = 'assignment-submissions' and public.can_write_assignment_submission(name));

create policy assignment_submissions_update_student
  on storage.objects for update to authenticated
  using (bucket_id = 'assignment-submissions' and public.can_write_assignment_submission(name))
  with check (bucket_id = 'assignment-submissions' and public.can_write_assignment_submission(name));

create policy assignment_submissions_delete_student
  on storage.objects for delete to authenticated
  using (bucket_id = 'assignment-submissions' and public.can_write_assignment_submission(name));
