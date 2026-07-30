"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

type State = {
  failed: boolean;
};

export class AppErrorBoundary extends Component<
  { children: ReactNode },
  State
> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("ExpenseTracker interface error", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="app-recovery" role="alert">
        <p className="eyebrow">ExpenseTracker</p>
        <h1>The interface needs to reload</h1>
        <p>
          Your stored receipts and claims are safe. Reload the app to reconnect
          to your private ledger.
        </p>
        <button
          className="primary-button"
          type="button"
          onClick={() => window.location.reload()}
        >
          Reload ExpenseTracker
        </button>
      </main>
    );
  }
}
