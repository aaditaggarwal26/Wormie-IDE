create table public.classroom_ai_usage_events (
  event_key uuid primary key,
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  assignment_id uuid references public.classroom_assignments (id) on delete set null,
  session_id uuid not null,
  event_type text not null check (event_type in ('request', 'quiz', 'usage')),
  mode text check (mode in ('ask', 'plan', 'agent')),
  request_length integer check (request_length between 1 and 4000),
  request_scope text check (request_scope in ('micro', 'small', 'medium', 'large')),
  quiz_question_count integer check (quiz_question_count between 0 and 100),
  quiz_score numeric(5, 2) check (quiz_score between 0 and 100),
  passed boolean,
  model text not null check (char_length(model) between 1 and 200),
  input_tokens bigint not null check (input_tokens between 0 and 1000000000),
  cached_input_tokens bigint not null check (cached_input_tokens between 0 and 1000000000),
  output_tokens bigint not null check (output_tokens between 0 and 1000000000),
  reasoning_output_tokens bigint not null check (reasoning_output_tokens between 0 and 1000000000),
  total_tokens bigint not null check (total_tokens between 0 and 1000000000),
  reported_credits numeric(12, 6) check (reported_credits between 0 and 1000000),
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (
    (event_type = 'request' and mode is not null and request_length is not null and quiz_question_count is not null and quiz_score is null and passed is null)
    or (event_type = 'quiz' and request_length is null and request_scope is null and quiz_question_count is not null and quiz_score is not null and passed is not null)
    or (event_type = 'usage' and mode is null and request_length is null and request_scope is null and quiz_question_count is null and quiz_score is null and passed is null)
  )
);

create index classroom_ai_usage_classroom_idx on public.classroom_ai_usage_events (classroom_id, occurred_at desc);
create index classroom_ai_usage_student_idx on public.classroom_ai_usage_events (classroom_id, student_id, occurred_at desc);

alter table public.classroom_ai_usage_events enable row level security;

revoke all on public.classroom_ai_usage_events from public, anon, authenticated, service_role;

create or replace function public.record_classroom_ai_usage_event(event_payload jsonb)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_event_key uuid := (event_payload ->> 'eventKey')::uuid;
  target_classroom_id uuid := (event_payload ->> 'classroomId')::uuid;
  target_student_id uuid := (event_payload ->> 'studentId')::uuid;
  target_assignment_id uuid := (event_payload ->> 'assignmentId')::uuid;
  target_session_id uuid := (event_payload ->> 'sessionId')::uuid;
  target_event_type text := event_payload ->> 'eventType';
  target_mode text := nullif(event_payload ->> 'mode', '');
  target_request_length integer := nullif(event_payload ->> 'requestLength', '')::integer;
  target_request_scope text := nullif(event_payload ->> 'requestScope', '');
  target_question_count integer := nullif(event_payload ->> 'quizQuestionCount', '')::integer;
  target_quiz_score numeric := nullif(event_payload ->> 'quizScore', '')::numeric;
  target_passed boolean := nullif(event_payload ->> 'passed', '')::boolean;
  target_model text := event_payload ->> 'model';
  target_input_tokens bigint := (event_payload ->> 'inputTokens')::bigint;
  target_cached_input_tokens bigint := (event_payload ->> 'cachedInputTokens')::bigint;
  target_output_tokens bigint := (event_payload ->> 'outputTokens')::bigint;
  target_reasoning_output_tokens bigint := (event_payload ->> 'reasoningOutputTokens')::bigint;
  target_total_tokens bigint := (event_payload ->> 'totalTokens')::bigint;
  target_reported_credits numeric := nullif(event_payload ->> 'reportedCredits', '')::numeric;
  target_occurred_at timestamptz := (event_payload ->> 'occurredAt')::timestamptz;
  inserted_rows integer;
begin
  if (select auth.uid()) is null or target_student_id <> (select auth.uid()) then
    raise exception 'AI analytics may only be recorded for the signed-in student.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.classroom_members
    where classroom_id = target_classroom_id
      and user_id = target_student_id
      and role = 'student'
  ) then
    raise exception 'The student is not enrolled in this classroom.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.classroom_assignments
    where id = target_assignment_id and classroom_id = target_classroom_id
  ) then
    raise exception 'The assignment does not belong to this classroom.' using errcode = '22023';
  end if;
  if target_event_type not in ('request', 'quiz', 'usage')
    or target_model is null or char_length(target_model) not between 1 and 200
    or target_input_tokens not between 0 and 1000000000 or target_cached_input_tokens not between 0 and 1000000000
    or target_output_tokens not between 0 and 1000000000 or target_reasoning_output_tokens not between 0 and 1000000000
    or target_total_tokens not between 0 and 1000000000
    or target_reported_credits < 0 or target_reported_credits > 1000000
  then
    raise exception 'Invalid AI analytics event.' using errcode = '22023';
  end if;

  insert into public.classroom_ai_usage_events (
    event_key, classroom_id, student_id, assignment_id, session_id, event_type, mode,
    request_length, request_scope, quiz_question_count, quiz_score, passed, model,
    input_tokens, cached_input_tokens, output_tokens, reasoning_output_tokens, total_tokens,
    reported_credits, occurred_at
  ) values (
    target_event_key, target_classroom_id, target_student_id, target_assignment_id, target_session_id,
    target_event_type, target_mode, target_request_length, target_request_scope, target_question_count,
    target_quiz_score, target_passed, target_model, target_input_tokens, target_cached_input_tokens,
    target_output_tokens, target_reasoning_output_tokens, target_total_tokens, target_reported_credits,
    target_occurred_at
  ) on conflict (event_key) do nothing;
  get diagnostics inserted_rows = row_count;
  return inserted_rows > 0;
end;
$$;

revoke all on function public.record_classroom_ai_usage_event(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.record_classroom_ai_usage_event(jsonb) to authenticated;

create or replace function public.get_classroom_ai_analytics(target_classroom_id uuid)
returns table (
  student_id uuid,
  request_count bigint,
  total_request_characters bigint,
  average_request_characters numeric,
  quiz_attempt_count bigint,
  quiz_question_count bigint,
  average_quiz_score numeric,
  micro_requests bigint,
  small_requests bigint,
  medium_requests bigint,
  large_requests bigint,
  input_tokens numeric,
  cached_input_tokens numeric,
  output_tokens numeric,
  reasoning_output_tokens numeric,
  total_tokens numeric,
  reported_credits numeric,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_classroom_owner(target_classroom_id) then
    raise exception 'Only the classroom teacher can view AI analytics.' using errcode = '42501';
  end if;

  return query
  select
    member.user_id,
    count(event.event_key) filter (where event.event_type = 'request'),
    coalesce(sum(event.request_length) filter (where event.event_type = 'request'), 0),
    coalesce(round(avg(event.request_length) filter (where event.event_type = 'request'), 1), 0),
    count(event.event_key) filter (where event.event_type = 'quiz'),
    coalesce(sum(event.quiz_question_count) filter (where event.event_type = 'quiz'), 0),
    round(avg(event.quiz_score) filter (where event.event_type = 'quiz'), 1),
    count(event.event_key) filter (where event.event_type = 'request' and event.request_scope = 'micro'),
    count(event.event_key) filter (where event.event_type = 'request' and event.request_scope = 'small'),
    count(event.event_key) filter (where event.event_type = 'request' and event.request_scope = 'medium'),
    count(event.event_key) filter (where event.event_type = 'request' and event.request_scope = 'large'),
    coalesce(sum(event.input_tokens), 0),
    coalesce(sum(event.cached_input_tokens), 0),
    coalesce(sum(event.output_tokens), 0),
    coalesce(sum(event.reasoning_output_tokens), 0),
    coalesce(sum(event.total_tokens), 0),
    sum(event.reported_credits),
    max(event.occurred_at)
  from public.classroom_members as member
  left join public.classroom_ai_usage_events as event
    on event.classroom_id = member.classroom_id and event.student_id = member.user_id
  where member.classroom_id = target_classroom_id and member.role = 'student'
  group by member.user_id
  order by max(event.occurred_at) desc nulls last, member.user_id;
end;
$$;

revoke all on function public.get_classroom_ai_analytics(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_classroom_ai_analytics(uuid) to authenticated;
