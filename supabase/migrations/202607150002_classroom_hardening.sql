alter table public.classroom_assignments
  drop constraint classroom_assignments_package_path_format;

alter table public.classroom_assignments
  add constraint classroom_assignments_package_path_format
  check (package_path ~ '^[a-f0-9-]{36}/[a-f0-9-]{36}/package[.]json$');

create index if not exists classrooms_owner_id_idx on public.classrooms (owner_id);
create index if not exists classroom_invites_created_by_idx on public.classroom_invites (created_by);
create index if not exists classroom_assignments_published_by_idx on public.classroom_assignments (published_by);

drop policy profiles_select_shared_classrooms on public.profiles;
create policy profiles_select_shared_classrooms
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.shares_classroom_with(id));

drop policy profiles_update_self on public.profiles;
create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

drop policy classrooms_update_owner on public.classrooms;
create policy classrooms_update_owner
  on public.classrooms for update to authenticated
  using (public.is_classroom_owner(id))
  with check (owner_id = (select auth.uid()));

drop policy classroom_assignments_insert_owner on public.classroom_assignments;
create policy classroom_assignments_insert_owner
  on public.classroom_assignments for insert to authenticated
  with check (public.is_classroom_owner(classroom_id) and published_by = (select auth.uid()));

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
