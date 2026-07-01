import { Component } from 'react'
import type { ReactNode } from 'react'

interface Props {
  children: ReactNode
  onClose?: () => void
}

interface State {
  hasError: boolean
}

export class SettingsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  render() {
    if (this.state.hasError) {
      return (
        <dialog open aria-modal="true" aria-label="Board settings error">
          <p>Settings failed to load. Please close and try again.</p>
          {this.props.onClose && (
            <button type="button" onClick={this.props.onClose}>
              Close
            </button>
          )}
        </dialog>
      )
    }
    return this.props.children
  }
}
