import { useEffect, useMemo, useRef, useState } from 'react'
import { Command } from 'lucide-react'
import { movePickerSelection, pickerKeyAction } from './pickerModel'

export type WorkbenchPickerItem = {
  id: string
  label: string
  description?: string
  shortcut?: string
  disabled?: boolean
  matchIndexes?: number[]
}

type Props = {
  ariaLabel: string
  emptyMessage: string
  footer?: string
  items: WorkbenchPickerItem[]
  loading?: boolean
  onClose: () => void
  onQueryChange: (query: string) => void
  onSelect: (item: WorkbenchPickerItem) => void
  placeholder: string
  query: string
}

function HighlightedPath({ indexes, value }: { indexes: number[]; value: string }): React.JSX.Element {
  const matches = useMemo(() => new Set(indexes), [indexes])
  return <>{value.split('').map((character, index) => matches.has(index)
    ? <mark key={`${index}:${character}`}>{character}</mark>
    : character)}</>
}

export function WorkbenchPicker({
  ariaLabel,
  emptyMessage,
  footer,
  items,
  loading = false,
  onClose,
  onQueryChange,
  onSelect,
  placeholder,
  query
}: Props): React.JSX.Element {
  const [selectedIndex, setSelectedIndex] = useState(items.findIndex((item) => !item.disabled))
  const previousFocus = useRef<HTMLElement | null>(document.activeElement instanceof HTMLElement ? document.activeElement : null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    inputRef.current?.focus()
    return () => previousFocus.current?.focus()
  }, [])

  useEffect(() => {
    setSelectedIndex(items.findIndex((item) => !item.disabled))
  }, [items])

  function move(direction: 1 | -1): void {
    if (!items.some((item) => !item.disabled)) return
    let next = selectedIndex
    do {
      next = movePickerSelection(next, items.length, direction)
    } while (items[next]?.disabled)
    setSelectedIndex(next)
  }

  return (
    <div className="picker-backdrop" onMouseDown={onClose}>
      <section
        aria-label={ariaLabel}
        aria-modal="true"
        className="workbench-picker"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="picker-input-row">
          <Command aria-hidden="true" size={16} />
          <input
            aria-activedescendant={selectedIndex >= 0 ? `picker-item-${items[selectedIndex]?.id}` : undefined}
            aria-controls="workbench-picker-results"
            aria-expanded="true"
            aria-label={ariaLabel}
            autoComplete="off"
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              const action = pickerKeyAction(event.key)
              if (action === 'none') return
              event.preventDefault()
              if (action === 'close') onClose()
              if (action === 'next') move(1)
              if (action === 'previous') move(-1)
              if (action === 'select' && selectedIndex >= 0 && !items[selectedIndex]?.disabled) onSelect(items[selectedIndex])
            }}
            placeholder={placeholder}
            ref={inputRef}
            role="combobox"
            value={query}
          />
          <kbd>Esc</kbd>
        </div>

        <div className="picker-results" id="workbench-picker-results" role="listbox">
          {loading && <div className="picker-state">Indexing workspace...</div>}
          {!loading && items.length === 0 && <div className="picker-state">{emptyMessage}</div>}
          {!loading && items.map((item, index) => (
            <button
              aria-disabled={item.disabled}
              aria-selected={selectedIndex === index}
              className="picker-result"
              data-disabled={item.disabled || undefined}
              id={`picker-item-${item.id}`}
              key={item.id}
              onClick={() => !item.disabled && onSelect(item)}
              onMouseEnter={() => setSelectedIndex(index)}
              role="option"
              type="button"
            >
              <span className="picker-result-copy">
                <strong>{item.label}</strong>
                {item.description && (
                  <span>{item.matchIndexes
                    ? <HighlightedPath indexes={item.matchIndexes} value={item.description} />
                    : item.description}</span>
                )}
              </span>
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
        {footer && <div className="picker-footer">{footer}</div>}
      </section>
    </div>
  )
}
