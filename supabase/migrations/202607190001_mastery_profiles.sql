create table public.mastery_profiles (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  device_id text not null,
  revision integer not null default 0,
  payload jsonb not null,
  summary jsonb not null,
  updated_at timestamptz not null default now(),
  constraint mastery_profiles_device_id_length check (char_length(device_id) between 1 and 200),
  constraint mastery_profiles_revision_nonnegative check (revision >= 0),
  constraint mastery_profiles_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint mastery_profiles_summary_object check (jsonb_typeof(summary) = 'object'),
  constraint mastery_profiles_summary_shape check (
    summary ? 'assessedConcepts'
    and summary ? 'overallMastery'
    and summary ? 'reviewDueConcepts'
    and summary ? 'weakConcepts'
    and summary ? 'strongConcepts'
  )
);

create index mastery_profiles_updated_at_idx on public.mastery_profiles (updated_at desc);

create or replace view public.classroom_mastery_summaries
with (security_invoker = true)
as
select
  members.classroom_id,
  members.user_id,
  profiles.display_name,
  coalesce((mastery.summary ->> 'assessedConcepts')::integer, 0) as assessed_concepts,
  case
    when mastery.summary ->> 'overallMastery' is null then null
    else (mastery.summary ->> 'overallMastery')::numeric
  end as overall_mastery,
  coalesce((mastery.summary ->> 'reviewDueConcepts')::integer, 0) as review_due_concepts,
  coalesce(mastery.summary -> 'weakConcepts', '[]'::jsonb) as weak_concepts,
  coalesce(mastery.summary -> 'strongConcepts', '[]'::jsonb) as strong_concepts,
  coalesce(mastery.updated_at, members.joined_at) as updated_at
from public.classroom_members members
join public.profiles profiles on profiles.id = members.user_id
left join public.mastery_profiles mastery on mastery.user_id = members.user_id
where public.is_classroom_member(members.classroom_id);

alter table public.mastery_profiles enable row level security;

create policy mastery_profiles_select_self_or_shared_teacher
  on public.mastery_profiles for select to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1
      from public.classroom_members teacher
      join public.classroom_members student
        on student.classroom_id = teacher.classroom_id
      where teacher.user_id = (select auth.uid())
        and teacher.role = 'teacher'
        and student.user_id = public.mastery_profiles.user_id
    )
  );

create policy mastery_profiles_insert_self
  on public.mastery_profiles for insert to authenticated
  with check (user_id = (select auth.uid()));

create policy mastery_profiles_update_self
  on public.mastery_profiles for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

revoke all on public.mastery_profiles from anon, authenticated;
grant select, insert, update on public.mastery_profiles to authenticated;
grant select on public.classroom_mastery_summaries to authenticated;
