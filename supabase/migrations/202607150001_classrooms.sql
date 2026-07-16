create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 100)
);

create table public.classrooms (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text not null default '',
  owner_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint classrooms_name_length check (char_length(btrim(name)) between 1 and 120),
  constraint classrooms_description_length check (char_length(description) <= 1000)
);

create table public.classroom_members (
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null,
  joined_at timestamptz not null default now(),
  primary key (classroom_id, user_id),
  constraint classroom_members_role check (role in ('teacher', 'student'))
);

create table public.classroom_invites (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint classroom_invites_code_format check (code ~ '^[a-f0-9]{32}$'),
  constraint classroom_invites_expiry check (expires_at is null or expires_at > created_at)
);

create unique index classroom_invites_one_active_per_classroom
  on public.classroom_invites (classroom_id)
  where revoked_at is null;

create table public.classroom_assignments (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null references public.classrooms (id) on delete cascade,
  local_assignment_id uuid not null,
  title text not null,
  summary text not null,
  manifest jsonb not null,
  manifest_revision text not null,
  package_sha256 text not null,
  package_path text not null unique,
  published_by uuid not null references public.profiles (id) on delete cascade,
  published_at timestamptz not null default now(),
  constraint classroom_assignments_title_length check (char_length(btrim(title)) between 1 and 120),
  constraint classroom_assignments_summary_length check (char_length(summary) between 1 and 500),
  constraint classroom_assignments_manifest_object check (jsonb_typeof(manifest) = 'object'),
  constraint classroom_assignments_manifest_revision_format check (manifest_revision ~ '^[a-f0-9]{64}$'),
  constraint classroom_assignments_package_sha256_format check (package_sha256 ~ '^[a-f0-9]{64}$'),
  constraint classroom_assignments_package_path_format check (package_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/package[.]json$'),
  constraint classroom_assignments_package_path_matches_row check (
    split_part(package_path, '/', 1) = classroom_id::text
    and split_part(package_path, '/', 2) = id::text
  ),
  unique (classroom_id, local_assignment_id, package_sha256)
);

create index classroom_members_user_id_idx on public.classroom_members (user_id);
create index classroom_members_classroom_id_idx on public.classroom_members (classroom_id);
create index classroom_assignments_classroom_published_idx on public.classroom_assignments (classroom_id, published_at desc);
create index classrooms_owner_id_idx on public.classrooms (owner_id);
create index classroom_invites_created_by_idx on public.classroom_invites (created_by);
create index classroom_assignments_published_by_idx on public.classroom_assignments (published_by);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''), split_part(coalesce(new.email, 'Wormie user'), '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

insert into public.profiles (id, display_name)
select
  id,
  coalesce(nullif(btrim(raw_user_meta_data ->> 'display_name'), ''), split_part(email, '@', 1))
from auth.users
where email is not null
on conflict (id) do nothing;

create or replace function public.is_classroom_member(target_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classroom_members
    where classroom_id = target_classroom_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.is_classroom_owner(target_classroom_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classrooms
    where id = target_classroom_id
      and owner_id = auth.uid()
  );
$$;

create or replace function public.shares_classroom_with(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.classroom_members mine
    join public.classroom_members theirs on theirs.classroom_id = mine.classroom_id
    where mine.user_id = auth.uid()
      and theirs.user_id = target_user_id
  );
$$;

create or replace function public.can_access_classroom_storage(object_name text, owner_only boolean)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  classroom_text text;
begin
  classroom_text := split_part(object_name, '/', 1);
  if classroom_text !~ '^[a-f0-9]{8}-[a-f0-9]{4}-[1-5][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$' then
    return false;
  end if;
  if owner_only then
    return public.is_classroom_owner(classroom_text::uuid);
  end if;
  return public.is_classroom_member(classroom_text::uuid);
end;
$$;

create or replace function public.can_delete_classroom_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_classroom_storage(object_name, true)
    and not exists (
      select 1
      from public.classroom_assignments
      where package_path = object_name
    );
$$;

create or replace function public.can_read_classroom_storage(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_classroom_storage(object_name, false)
    and exists (
      select 1
      from public.classroom_assignments
      where package_path = object_name
    );
$$;

create or replace function public.create_classroom(classroom_name text, classroom_description text default '')
returns table (classroom_id uuid, invite_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_classroom_id uuid := gen_random_uuid();
  new_invite_code text := replace(gen_random_uuid()::text, '-', '');
  normalized_name text := btrim(classroom_name);
  normalized_description text := coalesce(classroom_description, '');
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;
  if char_length(normalized_name) not between 1 and 120 then
    raise exception 'Classroom name must be between 1 and 120 characters.';
  end if;
  if char_length(normalized_description) > 1000 then
    raise exception 'Classroom description cannot exceed 1000 characters.';
  end if;

  insert into public.classrooms (id, name, description, owner_id)
  values (new_classroom_id, normalized_name, normalized_description, auth.uid());

  insert into public.classroom_members (classroom_id, user_id, role)
  values (new_classroom_id, auth.uid(), 'teacher');

  insert into public.classroom_invites (classroom_id, code, created_by)
  values (new_classroom_id, new_invite_code, auth.uid());

  return query select new_classroom_id, new_invite_code;
end;
$$;

create or replace function public.join_classroom(invite_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_classroom_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required.';
  end if;

  select classroom_id
    into target_classroom_id
  from public.classroom_invites
  where code = lower(btrim(invite_code))
    and revoked_at is null
    and (expires_at is null or expires_at > now())
  for update;

  if target_classroom_id is null then
    raise exception 'This classroom invitation is invalid or expired.';
  end if;

  insert into public.classroom_members (classroom_id, user_id, role)
  values (target_classroom_id, auth.uid(), 'student')
  on conflict (classroom_id, user_id) do nothing;

  return target_classroom_id;
end;
$$;

create or replace function public.rotate_classroom_invite(target_classroom_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_invite_code text := replace(gen_random_uuid()::text, '-', '');
begin
  if not public.is_classroom_owner(target_classroom_id) then
    raise exception 'Only the classroom owner can replace its invitation.';
  end if;

  update public.classroom_invites
  set revoked_at = now()
  where classroom_id = target_classroom_id and revoked_at is null;

  insert into public.classroom_invites (classroom_id, code, created_by)
  values (target_classroom_id, new_invite_code, auth.uid());

  return new_invite_code;
end;
$$;

alter table public.profiles enable row level security;
alter table public.classrooms enable row level security;
alter table public.classroom_members enable row level security;
alter table public.classroom_invites enable row level security;
alter table public.classroom_assignments enable row level security;

create policy profiles_select_shared_classrooms
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_classroom_with(id));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy classrooms_select_members
  on public.classrooms for select to authenticated
  using (public.is_classroom_member(id));

create policy classrooms_update_owner
  on public.classrooms for update to authenticated
  using (public.is_classroom_owner(id))
  with check (owner_id = (select auth.uid()));

create policy classrooms_delete_owner
  on public.classrooms for delete to authenticated
  using (public.is_classroom_owner(id));

create policy classroom_members_select_members
  on public.classroom_members for select to authenticated
  using (public.is_classroom_member(classroom_id));

create policy classroom_invites_select_owner
  on public.classroom_invites for select to authenticated
  using (public.is_classroom_owner(classroom_id));

create policy classroom_assignments_select_members
  on public.classroom_assignments for select to authenticated
  using (public.is_classroom_member(classroom_id));

create policy classroom_assignments_insert_owner
  on public.classroom_assignments for insert to authenticated
  with check (public.is_classroom_owner(classroom_id) and published_by = (select auth.uid()));

create policy classroom_assignments_delete_owner
  on public.classroom_assignments for delete to authenticated
  using (public.is_classroom_owner(classroom_id));

revoke all on public.profiles, public.classrooms, public.classroom_members, public.classroom_invites, public.classroom_assignments from anon, authenticated;
grant select, update(display_name) on public.profiles to authenticated;
grant select, update, delete on public.classrooms to authenticated;
grant select on public.classroom_members to authenticated;
grant select on public.classroom_invites to authenticated;
grant select, insert, delete on public.classroom_assignments to authenticated;

revoke all on function public.is_classroom_member(uuid) from public, anon, authenticated, service_role;
revoke all on function public.handle_new_user() from public, anon, authenticated, service_role;
revoke all on function public.is_classroom_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function public.shares_classroom_with(uuid) from public, anon, authenticated, service_role;
revoke all on function public.can_access_classroom_storage(text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.can_delete_classroom_storage(text) from public, anon, authenticated, service_role;
revoke all on function public.can_read_classroom_storage(text) from public, anon, authenticated, service_role;
revoke all on function public.create_classroom(text, text) from public, anon, authenticated, service_role;
revoke all on function public.join_classroom(text) from public, anon, authenticated, service_role;
revoke all on function public.rotate_classroom_invite(uuid) from public, anon, authenticated, service_role;
grant execute on function public.is_classroom_member(uuid) to authenticated;
grant execute on function public.is_classroom_owner(uuid) to authenticated;
grant execute on function public.shares_classroom_with(uuid) to authenticated;
grant execute on function public.can_access_classroom_storage(text, boolean) to authenticated;
grant execute on function public.can_delete_classroom_storage(text) to authenticated;
grant execute on function public.can_read_classroom_storage(text) to authenticated;
grant execute on function public.create_classroom(text, text) to authenticated;
grant execute on function public.join_classroom(text) to authenticated;
grant execute on function public.rotate_classroom_invite(uuid) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('assignment-packages', 'assignment-packages', false, 41943040, array['application/json'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy assignment_packages_select_members
  on storage.objects for select to authenticated
  using (bucket_id = 'assignment-packages' and public.can_read_classroom_storage(name));

create policy assignment_packages_insert_owner
  on storage.objects for insert to authenticated
  with check (bucket_id = 'assignment-packages' and public.can_access_classroom_storage(name, true));

create policy assignment_packages_delete_owner
  on storage.objects for delete to authenticated
  using (bucket_id = 'assignment-packages' and public.can_delete_classroom_storage(name));
