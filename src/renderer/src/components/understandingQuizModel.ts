import type { PublicQuizQuestion, UnderstandingAnswer } from '@shared/contracts'

export function isQuestionAnswered(_question: PublicQuizQuestion, answer: UnderstandingAnswer | undefined): boolean {
  if (!answer) return false
  return Array.isArray(answer.value) ? answer.value.length > 0 : typeof answer.value === 'string' ? answer.value.trim().length > 0 : typeof answer.value === 'boolean'
}

export function moveQuestionWithShortcut(current: number, count: number, event: { altKey: boolean; key: string }): number {
  if (!event.altKey) return current
  if (event.key === 'ArrowLeft') return Math.max(0, current - 1)
  if (event.key === 'ArrowRight') return Math.min(Math.max(0, count - 1), current + 1)
  return current
}

export function resolveSourcePath(root: string, relativePath: string, platform: string): string {
  const separator = platform === 'win32' ? '\\' : '/'
  return `${root.replace(/[\\/]+$/g, '')}${separator}${relativePath.replace(/^[\\/]+/, '').replace(/[\\/]/g, separator)}`
}
