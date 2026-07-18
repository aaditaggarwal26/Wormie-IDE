import { describe, expect, it } from 'vitest'
import { movePickerSelection, pickerKeyAction } from './pickerModel'

describe('picker keyboard model', () => {
  it('wraps arrow navigation', () => {
    expect(movePickerSelection(0, 3, 1)).toBe(1)
    expect(movePickerSelection(2, 3, 1)).toBe(0)
    expect(movePickerSelection(0, 3, -1)).toBe(2)
  })

  it('maps selection and dismissal keys', () => {
    expect(pickerKeyAction('Enter')).toBe('select')
    expect(pickerKeyAction('Escape')).toBe('close')
    expect(pickerKeyAction('ArrowDown')).toBe('next')
    expect(pickerKeyAction('a')).toBe('none')
  })
})
