import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { failed: boolean }

export function RendererCrashFallback(): React.JSX.Element {
  return <main className="renderer-crash" role="alert">
    <section className="renderer-crash-card">
      <span className="eyebrow">Wormie recovery</span>
      <h1>Wormie needs to reload.</h1>
      <p>Wormie will restore eligible editor session data after reloading.</p>
      <button autoFocus className="primary-button" onClick={() => window.location.reload()} type="button">Reload Wormie</button>
    </section>
  </main>
}

export class RendererErrorBoundary extends Component<Props, State> {
  state: State = { failed: false }

  static getDerivedStateFromError(): State {
    return { failed: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Wormie renderer failed:', error, info.componentStack)
  }

  render(): ReactNode {
    return this.state.failed ? <RendererCrashFallback /> : this.props.children
  }
}
