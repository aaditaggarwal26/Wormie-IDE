import type { ReviewedProposalFile } from '../../shared/contracts'
import { isReviewedEditSelection, type ResolvedProposalTextEdit } from './proposalEdits'

export type ReviewableProposalChange = {
  relativePath: string
  action: 'create' | 'update'
  content: string
  beforeContent: string | null
  surgicalEdits: ResolvedProposalTextEdit[] | null
}

export type ReviewedProposalChange<T extends ReviewableProposalChange> = T & {
  reviewedContent: string
  keptBlocks: number
  undoneBlocks: number
}

const maxFileCharacters = 500_000
const maxReviewedBlocks = 10_000

function validateBlockCount(value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > maxReviewedBlocks) {
    throw new Error('The proposal review contains an invalid block count.')
  }
  return value
}

export function resolveReviewedChanges<T extends ReviewableProposalChange>(
  changes: T[],
  reviews: ReviewedProposalFile[]
): ReviewedProposalChange<T>[] {
  if (!Array.isArray(reviews) || reviews.length !== changes.length) {
    throw new Error('Review every proposed file before applying changes.')
  }

  const changesByPath = new Map(changes.map((change) => [change.relativePath, change]))
  const reviewedPaths = new Set<string>()

  return reviews.map((review) => {
    if (!review || typeof review.relativePath !== 'string' || reviewedPaths.has(review.relativePath)) {
      throw new Error('The proposal review contains a duplicate or invalid file.')
    }
    reviewedPaths.add(review.relativePath)

    const change = changesByPath.get(review.relativePath)
    if (!change) throw new Error('The proposal review contains an unknown file.')
    if (typeof review.content !== 'string' || review.content.length > maxFileCharacters || review.content.includes('\0')) {
      throw new Error(`The reviewed content for ${review.relativePath} is invalid.`)
    }
    const validSelection = change.action === 'create'
      ? review.content === '' || review.content === change.content
      : change.beforeContent !== null && change.surgicalEdits !== null &&
        isReviewedEditSelection(change.beforeContent, review.content, change.surgicalEdits)
    if (!validSelection) throw new Error(`The reviewed content for ${review.relativePath} is not part of this proposal.`)

    return {
      ...change,
      reviewedContent: review.content,
      keptBlocks: validateBlockCount(review.keptBlocks),
      undoneBlocks: validateBlockCount(review.undoneBlocks)
    }
  })
}

export function hasReviewedChange<T extends ReviewableProposalChange>(change: ReviewedProposalChange<T>): boolean {
  return change.action === 'create'
    ? change.reviewedContent.length > 0
    : change.reviewedContent !== change.beforeContent
}
