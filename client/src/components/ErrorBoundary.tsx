import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";

import { Button } from "./ui/button";

interface State {
  error: Error | null;
}

/** Stops a render failure from blanking the whole app halfway through a lot. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    console.error("Unhandled render error", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="grid min-h-screen place-items-center bg-bg p-6">
        <div className="w-full max-w-sm rounded-lg border border-line bg-surface p-6 text-center shadow-md">
          <div className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-lg bg-critical-soft text-critical">
            <AlertTriangle className="h-5 w-5" />
          </div>
          <h1 className="text-title text-ink">Something broke</h1>
          <p className="text-caption text-ink-secondary mt-1.5">
            The screen failed to render. Reloading usually sorts it out, and anything you
            already saved is untouched.
          </p>
          <pre className="mono mt-4 max-h-24 overflow-auto rounded-sm bg-surface-sunken p-2 text-left text-[0.6875rem] text-ink-tertiary">
            {this.state.error.message}
          </pre>
          <Button variant="primary" className="mt-4 w-full" onClick={() => window.location.reload()}>
            Reload
          </Button>
        </div>
      </div>
    );
  }
}
