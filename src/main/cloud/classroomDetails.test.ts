import { describe, expect, it } from 'vitest'
import { classroomUpdateSchema } from './classroomDetails'

describe('classroom detail validation', () => {
  const classroomId = '123e4567-e89b-12d3-a456-426614174000'

  it('normalizes valid teacher changes', () => {
    expect(classroomUpdateSchema.parse({ classroomId, name: '  Studio  ', description: '  Build apps.  ' })).toEqual({ classroomId, name: 'Studio', description: 'Build apps.' })
  })

  it('rejects invalid or unexpected changes', () => {
    expect(() => classroomUpdateSchema.parse({ classroomId: 'wrong', name: '', description: '' })).toThrow()
    expect(() => classroomUpdateSchema.parse({ classroomId, name: 'Studio', description: '', ownerId: 'attacker' })).toThrow()
  })
})
