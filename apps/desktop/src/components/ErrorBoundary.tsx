import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Catches render-time crashes in the main view so one bad note/screen
 * degrades to a recoverable message instead of blacking out the whole
 * window with no way back short of a full app restart (the failure mode
 * that hit the "Untitled" CBD note: a malformed-for-this-code table block
 * threw inside NoteOutline's render with nothing to catch it). */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Render crash caught by ErrorBoundary:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="app-main__empty app-error-boundary">
          <AlertTriangle size={28} strokeWidth={1.5} />
          <span>Something went wrong showing this.</span>
          <span className="app-error-boundary__detail">{this.state.error.message}</span>
          <button className="btn btn--sm" onClick={() => this.setState({ error: null })}>
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
