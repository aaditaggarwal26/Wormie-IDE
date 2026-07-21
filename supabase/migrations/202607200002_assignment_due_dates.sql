alter table public.classroom_assignments
  add column due_at timestamptz;

alter table public.classroom_assignments
  add constraint classroom_assignments_due_after_publish
  check (due_at is null or due_at > published_at);

create index classroom_assignments_classroom_due_idx
  on public.classroom_assignments (classroom_id, due_at)
  where due_at is not null;
