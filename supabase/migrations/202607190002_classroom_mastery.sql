create table public.classroom_mastery_events (
  event_key text primary key,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  assignment_id uuid references public.classroom_assignments (id) on delete set null,
  quiz_id uuid not null,
  attempt integer not null check (attempt between 1 and 100),
  score integer not null check (score between 0 and 100),
  passed boolean not null,
  source text not null check (char_length(source) between 1 and 80),
  title text not null check (char_length(title) between 1 and 160),
  concepts jsonb not null check (jsonb_typeof(concepts) = 'array' and jsonb_array_length(concepts) <= 100),
  completed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique (classroom_id, student_id, quiz_id, attempt)
);

create table public.classroom_mastery (
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  concept_id text not null check (char_length(concept_id) between 1 and 200),
  concept_name text not null check (char_length(concept_name) between 1 and 200),
  mastery integer not null check (mastery between 0 and 100),
  attempts integer not null check (attempts between 0 and 1000000),
  correct integer not null check (correct between 0 and attempts),
  updated_at timestamptz not null,
  primary key (classroom_id, student_id, concept_id)
);

create index classroom_mastery_student_idx on public.classroom_mastery (classroom_id, student_id, updated_at desc);
create index classroom_mastery_events_student_idx on public.classroom_mastery_events (classroom_id, student_id, completed_at desc);

alter table public.classroom_mastery enable row level security;
alter table public.classroom_mastery_events enable row level security;

create policy classroom_mastery_select_scope
  on public.classroom_mastery for select to authenticated
  using ((student_id = (select auth.uid()) and public.is_classroom_member(classroom_id)) or public.is_classroom_owner(classroom_id));

create policy classroom_mastery_events_select_scope
  on public.classroom_mastery_events for select to authenticated
  using ((student_id = (select auth.uid()) and public.is_classroom_member(classroom_id)) or public.is_classroom_owner(classroom_id));

revoke all on public.classroom_mastery, public.classroom_mastery_events from anon, authenticated;
grant select on public.classroom_mastery, public.classroom_mastery_events to authenticated;

create or replace function public.record_classroom_mastery_event(
  event_payload jsonb
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_classroom_id uuid := (event_payload ->> 'classroomId')::uuid;
  target_student_id uuid := (event_payload ->> 'studentId')::uuid;
  target_assignment_id uuid := nullif(event_payload ->> 'assignmentId', '')::uuid;
  target_quiz_id uuid := (event_payload ->> 'quizId')::uuid;
  target_attempt integer := (event_payload ->> 'attempt')::integer;
  target_score integer := (event_payload ->> 'score')::integer;
  target_completed_at timestamptz := (event_payload ->> 'completedAt')::timestamptz;
  concept jsonb;
  inserted_rows integer;
begin
  if (select auth.uid()) is null or target_student_id <> (select auth.uid()) then
    raise exception 'Mastery may only be recorded for the signed-in student.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.classroom_members
    where classroom_id = target_classroom_id
      and user_id = target_student_id
      and role = 'student'
  ) then
    raise exception 'The student is not enrolled in this classroom.' using errcode = '42501';
  end if;
  if target_assignment_id is not null and not exists (
    select 1 from public.classroom_assignments
    where id = target_assignment_id and classroom_id = target_classroom_id
  ) then
    raise exception 'The assignment does not belong to this classroom.' using errcode = '22023';
  end if;
  if jsonb_typeof(event_payload -> 'concepts') <> 'array' or jsonb_array_length(event_payload -> 'concepts') > 100 then
    raise exception 'Invalid mastery concepts.' using errcode = '22023';
  end if;

  insert into public.classroom_mastery_events (
    event_key, classroom_id, student_id, assignment_id, quiz_id, attempt, score, passed, source, title, concepts, completed_at
  ) values (
    left(event_payload ->> 'eventKey', 500), target_classroom_id, target_student_id, target_assignment_id,
    target_quiz_id, target_attempt, target_score, (event_payload ->> 'passed')::boolean,
    left(event_payload ->> 'source', 80), left(event_payload ->> 'title', 160), event_payload -> 'concepts', target_completed_at
  ) on conflict (classroom_id, student_id, quiz_id, attempt) do nothing;
  get diagnostics inserted_rows = row_count;
  if inserted_rows = 0 then return false; end if;

  for concept in select value from jsonb_array_elements(event_payload -> 'concepts') loop
    insert into public.classroom_mastery (
      classroom_id, student_id, concept_id, concept_name, mastery, attempts, correct, updated_at
    ) values (
      target_classroom_id,
      target_student_id,
      left(concept ->> 'conceptId', 200),
      left(concept ->> 'name', 200),
      (concept ->> 'mastery')::integer,
      (concept ->> 'attempts')::integer,
      (concept ->> 'correct')::integer,
      (concept ->> 'updatedAt')::timestamptz
    ) on conflict (classroom_id, student_id, concept_id) do update set
      concept_name = excluded.concept_name,
      mastery = excluded.mastery,
      attempts = excluded.attempts,
      correct = excluded.correct,
      updated_at = excluded.updated_at
    where excluded.updated_at >= public.classroom_mastery.updated_at;
  end loop;
  return true;
end;
$$;

revoke all on function public.record_classroom_mastery_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_classroom_mastery_event(jsonb) to authenticated;
