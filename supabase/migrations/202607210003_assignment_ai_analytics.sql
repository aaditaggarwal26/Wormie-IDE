create index classroom_ai_usage_assignment_idx
  on public.classroom_ai_usage_events (classroom_id, assignment_id, student_id, occurred_at desc)
  where assignment_id is not null;

create or replace function public.get_classroom_assignment_overview(target_classroom_id uuid)
returns table (
  assignment_id uuid,
  student_id uuid,
  status text,
  completed_tasks integer,
  total_tasks integer,
  started_at timestamptz,
  updated_at timestamptz,
  submitted_at timestamptz,
  submission_available boolean,
  request_count bigint,
  average_request_characters numeric,
  quiz_attempt_count bigint,
  quiz_question_count bigint,
  average_quiz_score numeric,
  micro_requests bigint,
  small_requests bigint,
  medium_requests bigint,
  large_requests bigint,
  total_tokens numeric,
  reported_credits numeric,
  ai_last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not public.is_classroom_owner(target_classroom_id) then
    raise exception 'Only the classroom teacher can view assignment progress and AI analytics.' using errcode = '42501';
  end if;

  return query
  with assignment_ai as (
    select
      event.assignment_id,
      event.student_id,
      count(event.event_key) filter (where event.event_type = 'request') as request_count,
      coalesce(round(avg(event.request_length) filter (where event.event_type = 'request'), 1), 0) as average_request_characters,
      count(event.event_key) filter (where event.event_type = 'quiz') as quiz_attempt_count,
      coalesce(sum(event.quiz_question_count) filter (where event.event_type = 'quiz'), 0) as quiz_question_count,
      round(avg(event.quiz_score) filter (where event.event_type = 'quiz'), 1) as average_quiz_score,
      count(event.event_key) filter (where event.event_type = 'request' and event.request_scope = 'micro') as micro_requests,
      count(event.event_key) filter (where event.event_type = 'request' and event.request_scope = 'small') as small_requests,
      count(event.event_key) filter (where event.event_type = 'request' and event.request_scope = 'medium') as medium_requests,
      count(event.event_key) filter (where event.event_type = 'request' and event.request_scope = 'large') as large_requests,
      coalesce(sum(event.total_tokens), 0) as total_tokens,
      sum(event.reported_credits) as reported_credits,
      max(event.occurred_at) as last_activity_at
    from public.classroom_ai_usage_events as event
    where event.classroom_id = target_classroom_id and event.assignment_id is not null
    group by event.assignment_id, event.student_id
  )
  select
    assignment.id,
    member.user_id,
    coalesce(progress.status, 'not-started'),
    coalesce(progress.completed_tasks, 0),
    jsonb_array_length(assignment.manifest -> 'tasks'),
    progress.started_at,
    progress.updated_at,
    progress.submitted_at,
    progress.submission_path is not null,
    coalesce(analytics.request_count, 0),
    coalesce(analytics.average_request_characters, 0),
    coalesce(analytics.quiz_attempt_count, 0),
    coalesce(analytics.quiz_question_count, 0),
    analytics.average_quiz_score,
    coalesce(analytics.micro_requests, 0),
    coalesce(analytics.small_requests, 0),
    coalesce(analytics.medium_requests, 0),
    coalesce(analytics.large_requests, 0),
    coalesce(analytics.total_tokens, 0),
    analytics.reported_credits,
    analytics.last_activity_at
  from public.classroom_assignments as assignment
  join public.classroom_members as member
    on member.classroom_id = assignment.classroom_id and member.role = 'student'
  left join public.classroom_assignment_progress as progress
    on progress.assignment_id = assignment.id and progress.student_id = member.user_id
  left join assignment_ai as analytics
    on analytics.assignment_id = assignment.id and analytics.student_id = member.user_id
  where assignment.classroom_id = target_classroom_id
  order by assignment.published_at desc, greatest(progress.updated_at, analytics.last_activity_at) desc nulls last, member.user_id;
end;
$$;

revoke all on function public.get_classroom_assignment_overview(uuid) from public, anon, authenticated, service_role;
grant execute on function public.get_classroom_assignment_overview(uuid) to authenticated;
