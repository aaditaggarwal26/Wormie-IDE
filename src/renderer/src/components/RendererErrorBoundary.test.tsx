import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { RendererCrashFallback } from './RendererErrorBoundary'

describe('renderer crash fallback', () => {
  it('offers a clear recovery action without exposing an error stack', () => {
    const markup = renderToStaticMarkup(<RendererCrashFallback />)
    expect(markup).toContain('Wormie needs to reload')
    expect(markup).toContain('Reload Wormie')
    expect(markup).toContain('role="alert"')
    expect(markup).not.toContain('Error:')
  })
})
