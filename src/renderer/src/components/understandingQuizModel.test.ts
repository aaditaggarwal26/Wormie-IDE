import { describe, expect, it } from 'vitest'
import type { PublicQuizQuestion } from '@shared/contracts'
import { isQuestionAnswered, moveQuestionWithShortcut, resolveSourcePath } from './understandingQuizModel'

const question = { id: 'q', type: 'short_answer', conceptId: 'flow', prompt: 'Explain', difficulty: 'medium', sourceReferences: [] } satisfies PublicQuizQuestion

describe('understanding quiz UI model', () => {
  it('requires meaningful written answers', () => {
    expect(isQuestionAnswered(question, { value: '   ' })).toBe(false)
    expect(isQuestionAnswered(question, { value: 'The main process validates first.' })).toBe(true)
  })

  it('supports bounded Alt+Arrow keyboard progression', () => {
    expect(moveQuestionWithShortcut(1, 3, { altKey: true, key: 'ArrowRight' })).toBe(2)
    expect(moveQuestionWithShortcut(2, 3, { altKey: true, key: 'ArrowRight' })).toBe(2)
    expect(moveQuestionWithShortcut(0, 3, { altKey: true, key: 'ArrowLeft' })).toBe(0)
  })

  it('resolves grounded source references for both desktop path styles', () => {
    expect(resolveSourcePath('C:\\repo', 'src/auth.ts', 'win32')).toBe('C:\\repo\\src\\auth.ts')
    expect(resolveSourcePath('/repo', 'src/auth.ts', 'linux')).toBe('/repo/src/auth.ts')
  })
})
