import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(path.join(process.cwd(), 'supabase/migrations/202607190001_mastery_profiles.sql'), 'utf8')

describe('mastery profile cloud policy', () => {
  it('keeps raw mastery rows scoped to self or shared classroom teachers', () => {
    expect(migration).toContain('mastery_profiles_select_self_or_shared_teacher')
    expect(migration).toContain("teacher.role = 'teacher'")
    expect(migration).toContain('user_id = (select auth.uid())')
  })

  it('exposes classroom summaries through a member-scoped view', () => {
    expect(migration).toContain('create or replace view public.classroom_mastery_summaries')
    expect(migration).toContain('where public.is_classroom_member(members.classroom_id)')
    expect(migration).toContain('grant select on public.classroom_mastery_summaries to authenticated')
  })
})
