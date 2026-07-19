create or replace function public.list_visible_classroom_members()
returns table (
  classroom_id uuid,
  user_id uuid,
  email text,
  display_name text,
  role text,
  joined_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    member.classroom_id,
    member.user_id,
    account.email::text,
    profile.display_name,
    member.role,
    member.joined_at
  from public.classroom_members as member
  join public.profiles as profile on profile.id = member.user_id
  join auth.users as account on account.id = member.user_id
  where exists (
    select 1
    from public.classroom_members as caller
    where caller.classroom_id = member.classroom_id
      and caller.user_id = (select auth.uid())
  )
  and (
    member.user_id = (select auth.uid())
    or member.role = 'teacher'
    or exists (
      select 1
      from public.classroom_members as caller
      where caller.classroom_id = member.classroom_id
        and caller.user_id = (select auth.uid())
        and caller.role = 'teacher'
    )
  );
$$;

create or replace function public.add_classroom_student_by_email(
  target_classroom_id uuid,
  student_email text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized_email text := lower(btrim(student_email));
  target_user_id uuid;
  affected_rows integer;
begin
  if (select auth.uid()) is null or not public.is_classroom_owner(target_classroom_id) then
    raise exception 'Only the classroom teacher can add students.' using errcode = '42501';
  end if;
  if char_length(normalized_email) < 3 or char_length(normalized_email) > 320 or position('@' in normalized_email) < 2 then
    raise exception 'Enter a valid student email.' using errcode = '22023';
  end if;

  select account.id into target_user_id
  from auth.users as account
  where lower(account.email) = normalized_email
    and account.email_confirmed_at is not null
  limit 1;

  if target_user_id is null then
    return false;
  end if;

  insert into public.classroom_members (classroom_id, user_id, role)
  values (target_classroom_id, target_user_id, 'student')
  on conflict (classroom_id, user_id) do nothing;
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.remove_classroom_student(
  target_classroom_id uuid,
  student_user_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if (select auth.uid()) is null or not public.is_classroom_owner(target_classroom_id) then
    raise exception 'Only the classroom teacher can remove students.' using errcode = '42501';
  end if;

  delete from public.classroom_members
  where classroom_id = target_classroom_id
    and user_id = student_user_id
    and role = 'student';
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

create or replace function public.leave_classroom(target_classroom_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  affected_rows integer;
begin
  if (select auth.uid()) is null then
    raise exception 'Sign in to leave a classroom.' using errcode = '42501';
  end if;

  delete from public.classroom_members
  where classroom_id = target_classroom_id
    and user_id = (select auth.uid())
    and role = 'student';
  get diagnostics affected_rows = row_count;
  return affected_rows = 1;
end;
$$;

revoke all on function public.list_visible_classroom_members() from public, anon, authenticated, service_role;
revoke all on function public.add_classroom_student_by_email(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.remove_classroom_student(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.leave_classroom(uuid) from public, anon, authenticated, service_role;

grant execute on function public.list_visible_classroom_members() to authenticated;
grant execute on function public.add_classroom_student_by_email(uuid, text) to authenticated;
grant execute on function public.remove_classroom_student(uuid, uuid) to authenticated;
grant execute on function public.leave_classroom(uuid) to authenticated;
