import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202607210001_assignment_progress_submissions.sql'), 'utf8')
const hardeningMigration = readFileSync(resolve('supabase/migrations/202607210002_assignment_progress_hardening.sql'), 'utf8')
const analyticsMigration = readFileSync(resolve('supabase/migrations/202607210003_assignment_ai_analytics.sql'), 'utf8')

describe('classroom assignment progress migration', () => {
  it('keeps student progress writes behind authenticated RPCs', () => {
    expect(migration).toContain('create table public.classroom_assignment_progress')
    expect(migration).toContain('target_student_id <> (select auth.uid())')
    expect(migration).toContain("and role = 'student'")
    expect(migration).toContain('target_local_assignment_id is distinct from expected_local_assignment_id')
    expect(migration).toContain('target_assignment_revision is distinct from expected_assignment_revision')
    expect(migration).toContain('revoke all on public.classroom_assignment_progress')
    expect(migration).toContain('grant select on public.classroom_assignment_progress to authenticated')
    expect(migration).not.toContain('grant insert on public.classroom_assignment_progress')
    expect(migration).not.toContain('grant update on public.classroom_assignment_progress')
  })

  it('limits classroom progress reports to the teacher', () => {
    expect(migration).toContain('public.is_classroom_owner(target_classroom_id)')
    expect(migration).toContain('Only the classroom teacher can view assignment progress.')
    expect(migration).toContain('grant execute on function public.get_classroom_assignment_progress(uuid) to authenticated')
  })

  it('stores submissions privately with user and classroom scoped paths', () => {
    expect(migration).toContain("values ('assignment-submissions', 'assignment-submissions', false")
    expect(migration).toContain('student_text <> (select auth.uid())::text')
    expect(migration).toContain('public.is_classroom_owner(progress.classroom_id)')
    expect(migration).toContain("bucket_id = 'assignment-submissions'")
    expect(migration).toContain("submission_sha256 ~ '^[a-f0-9]{64}$'")
    expect(migration).toContain('submission_sha256 is not null')
    expect(migration).toContain('submission_bytes is not null')
  })

  it('reapplies null-safe checks for databases that received the initial migration', () => {
    expect(hardeningMigration).toContain('drop constraint classroom_assignment_progress_submission_state')
    expect(hardeningMigration).toContain('target_local_assignment_id is distinct from expected_local_assignment_id')
    expect(hardeningMigration).toContain('target_submission_path is distinct from')
    expect(hardeningMigration).toContain('submission_sha256 is not null')
    expect(hardeningMigration).toContain('submission_bytes is not null')
  })

  it('reports AI usage per student and assignment to the classroom teacher', () => {
    expect(analyticsMigration).toContain('create or replace function public.get_classroom_assignment_overview')
    expect(analyticsMigration).toContain('public.is_classroom_owner(target_classroom_id)')
    expect(analyticsMigration).toContain('group by event.assignment_id, event.student_id')
    expect(analyticsMigration).toContain("event.event_type = 'request'")
    expect(analyticsMigration).toContain("event.event_type = 'quiz'")
    expect(analyticsMigration).toContain('grant execute on function public.get_classroom_assignment_overview(uuid) to authenticated')
    expect(analyticsMigration).not.toMatch(/prompt|response_text|conversation/i)
  })
})
