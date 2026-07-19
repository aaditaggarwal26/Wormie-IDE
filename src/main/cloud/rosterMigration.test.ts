import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202607190001_classroom_roster_management.sql'), 'utf8')

describe('classroom roster migration', () => {
  it('keeps roster writes behind teacher-validated security definer functions', () => {
    expect(migration).toContain('security definer')
    expect(migration).toContain('not public.is_classroom_owner(target_classroom_id)')
    expect(migration).toContain("and role = 'student'")
    expect(migration).toContain('revoke all on function public.remove_classroom_student')
  })

  it('limits student roster visibility to teachers and their own account', () => {
    expect(migration).toContain("or member.role = 'teacher'")
    expect(migration).toContain('member.user_id = (select auth.uid())')
    expect(migration).toContain("and caller.role = 'teacher'")
  })
})
