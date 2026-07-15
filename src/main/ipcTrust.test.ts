import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'
import { createRendererUrlValidator } from './ipcTrust'

describe('renderer URL trust', () => {
  it('accepts only the configured development origin', () => {
    const validate = createRendererUrlValidator('http://localhost:5173', 'C:\\app\\renderer\\index.html')
    expect(validate('http://localhost:5173/')).toBe(true)
    expect(validate('http://localhost:5173/editor?file=one')).toBe(true)
    expect(validate('https://example.com/')).toBe(false)
    expect(validate('http://localhost:5174/')).toBe(false)
  })

  it('accepts only the packaged renderer file', () => {
    const rendererPath = path.resolve('renderer', 'index.html')
    const validate = createRendererUrlValidator(undefined, rendererPath)
    const rendererUrl = pathToFileURL(rendererPath).toString()
    expect(validate(rendererUrl)).toBe(true)
    expect(validate('https://example.com/')).toBe(false)
    expect(validate(new URL('other.html', rendererUrl).toString())).toBe(false)
  })
})
