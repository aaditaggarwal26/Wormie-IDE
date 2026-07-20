import type * as monaco from 'monaco-editor'

export type OutlineSymbol = {
  id: string
  name: string
  kind: string
  depth: number
  line: number
}

type NavigationTree = {
  text?: string
  kind?: string
  spans?: Array<{ start: number; length: number }>
  childItems?: NavigationTree[]
}

export function flattenNavigationTree(tree: NavigationTree, model: monaco.editor.ITextModel): OutlineSymbol[] {
  const symbols: OutlineSymbol[] = []
  function visit(items: NavigationTree[] | undefined, depth: number): void {
    for (const item of items ?? []) {
      const start = item.spans?.[0]?.start
      if (typeof start === 'number') {
        const line = model.getPositionAt(start).lineNumber
        symbols.push({ id: `${start}:${item.kind ?? ''}:${item.text ?? ''}`, name: item.text ?? 'Unnamed symbol', kind: item.kind ?? 'symbol', depth, line })
      }
      visit(item.childItems, depth + 1)
    }
  }
  visit(tree.childItems, 0)
  return symbols
}
