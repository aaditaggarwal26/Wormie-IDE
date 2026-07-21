alter table public.classroom_assignment_progress
  drop constraint classroom_assignment_progress_submission_state;

alter table public.classroom_assignment_progress
  add constraint classroom_assignment_progress_submission_state check (
    (status = 'in-progress' and submitted_at is null and submission_path is null and submission_sha256 is null and submission_bytes is null)
    or
    (status = 'submitted' and completed_tasks = total_tasks and submitted_at is not null and submission_path is not null
      and submission_sha256 is not null and submission_sha256 ~ '^[a-f0-9]{64}$'
      and submission_bytes is not null and submission_bytes between 1 and 16777216)
  );

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
