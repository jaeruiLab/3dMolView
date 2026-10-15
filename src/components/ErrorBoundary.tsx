import { Component, type ErrorInfo, type ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Short description of the protected area, used in the fallback text. */
  area: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Keeps a rendering failure in one area (the 3D viewer) from taking down the whole app.
 * The fallback offers a reset that remounts the children.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`[MolView] ${this.props.area} crashed`, error, info.componentStack);
  }

  private reset = () => this.setState({ error: null });

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 rounded-panel border border-line bg-panel p-6 text-center">
        <p className="text-sm text-fg">The {this.props.area} stopped working.</p>
        <p className="max-w-sm text-xs text-muted">{this.state.error.message}</p>
        <button
          type="button"
          onClick={this.reset}
          className="h-8 rounded-ctl border border-line px-3 text-xs font-medium text-fg hover:bg-hover pointer-coarse:h-11"
        >
          Restart {this.props.area}
        </button>
      </div>
    );
  }
}
