import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const migration = readFileSync(resolve('supabase/migrations/202607200001_classroom_ai_analytics.sql'), 'utf8')

describe('classroom AI analytics migration', () => {
  it('stores metadata without conversation content and keeps writes behind an RPC', () => {
    expect(migration).toContain('create table public.classroom_ai_usage_events')
    expect(migration).not.toMatch(/prompt|response_text|conversation/i)
    expect(migration).toContain('security definer')
    expect(migration).toContain('target_student_id <> (select auth.uid())')
    expect(migration).toContain("and role = 'student'")
    expect(migration).toContain('revoke all on public.classroom_ai_usage_events')
  })

  it('limits aggregate reads to the classroom owner', () => {
    expect(migration).toContain('public.is_classroom_owner(target_classroom_id)')
    expect(migration).toContain('revoke all on function public.get_classroom_ai_analytics')
    expect(migration).toContain('grant execute on function public.get_classroom_ai_analytics(uuid) to authenticated')
  })
})
