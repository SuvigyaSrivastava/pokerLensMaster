import React from 'react'
import ReactDOM from 'react-dom/client'
import Root from './Root.jsx'
import './index.css'

// A render bug must never leave someone staring at a blank page mid-hand.
class ErrorBoundary extends React.Component {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(error) { console.error(error) }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="min-h-[100dvh] grid place-items-center p-8 text-center">
        <div className="max-w-sm">
          <p className="font-display text-4xl">Something broke on this screen.</p>
          <p className="text-sm text-fg-muted mt-3">Reload to start a fresh session. Nothing was saved.</p>
          <button onClick={() => window.location.reload()} className="btn-primary h-12 px-6 mt-6">Reload</button>
        </div>
      </div>
    )
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <Root />
    </ErrorBoundary>
  </React.StrictMode>,
)
