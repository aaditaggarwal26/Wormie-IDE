import { describe, expect, it } from 'vitest'
import { flattenNavigationTree } from './outlineModel'

describe('outline model', () => {
  it('flattens navigation trees with stable depth and lines', () => {
    const model = { getPositionAt: (offset: number) => ({ lineNumber: offset === 0 ? 1 : 4 }) }
    const symbols = flattenNavigationTree({ childItems: [{
      text: 'App', kind: 'class', spans: [{ start: 0, length: 3 }], childItems: [
        { text: 'render', kind: 'method', spans: [{ start: 20, length: 6 }] }
      ]
    }] }, model as never)
    expect(symbols.map(({ name, depth, line }) => ({ name, depth, line }))).toEqual([
      { name: 'App', depth: 0, line: 1 },
      { name: 'render', depth: 1, line: 4 }
    ])
  })
})
