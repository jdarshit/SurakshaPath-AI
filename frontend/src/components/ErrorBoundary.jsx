import { Component } from 'react';

/**
 * Catches any render/runtime crash in the React tree below it and shows a
 * recoverable "Something went wrong" card instead of an unmounted blank
 * white screen. Error boundaries must be class components (no hook API
 * exists for componentDidCatch/getDerivedStateFromError yet).
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[ErrorBoundary] Uncaught render error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#0A0A0F] px-4 text-slate-100">
          <div className="w-full max-w-md rounded-3xl border border-[var(--card-border)] bg-[var(--card-bg)] p-8 text-center shadow-[0_0_60px_rgba(255,45,120,0.14)]">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[rgba(255,45,120,0.12)] text-3xl text-[var(--primary)]">
              !
            </div>
            <h2 className="mt-5 text-xl font-semibold text-white">Something went wrong</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              An unexpected error occurred while rendering this page. Your data is safe — reload to continue.
            </p>
            <button
              type="button"
              onClick={this.handleReload}
              className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[var(--primary)] to-[var(--accent-purple)] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_32px_rgba(255,45,120,0.25)] transition hover:brightness-110"
            >
              Reload
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
