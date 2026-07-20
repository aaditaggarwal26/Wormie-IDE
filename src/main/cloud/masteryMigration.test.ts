import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202607190002_classroom_mastery.sql'), 'utf8')

describe('classroom mastery migration', () => {
  it('enforces student and teacher read boundaries with RLS', () => {
    expect(migration).toContain('alter table public.classroom_mastery enable row level security')
    expect(migration).toContain('student_id = (select auth.uid()) and public.is_classroom_member(classroom_id)')
    expect(migration).toContain('revoke all on public.classroom_mastery')
  })

  it('records only the signed-in enrolled student and validates assignment scope', () => {
    expect(migration).toContain('target_student_id <> (select auth.uid())')
    expect(migration).toContain("and role = 'student'")
    expect(migration).toContain('where id = target_assignment_id and classroom_id = target_classroom_id')
    expect(migration).toContain('on conflict (classroom_id, student_id, quiz_id, attempt) do nothing')
  })
})
