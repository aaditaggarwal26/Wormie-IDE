import { useState } from 'react'
import { WorkbenchPicker } from './WorkbenchPicker'

type Props = {
  currentLine: number
  onClose: () => void
  onGo: (line: number) => void
}

export function GoToLine({ currentLine, onClose, onGo }: Props): React.JSX.Element {
  const [query, setQuery] = useState('')
  const line = Number(query)
  const valid = Number.isInteger(line) && line > 0
  return (
    <WorkbenchPicker
      ariaLabel="Go to Line"
      emptyMessage={query ? 'Enter a positive line number.' : `Current line: ${currentLine}`}
      items={valid ? [{ id: String(line), label: `Go to line ${line}` }] : []}
      onClose={onClose}
      onQueryChange={(value) => setQuery(value.replace(/[^0-9]/g, ''))}
      onSelect={() => { onGo(line); onClose() }}
      placeholder={`Line number (${currentLine})`}
      query={query}
    />
  )
}
