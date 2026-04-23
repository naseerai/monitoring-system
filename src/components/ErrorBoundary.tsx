/* eslint-disable @typescript-eslint/no-explicit-any */
import React from 'react';

interface State {
  hasError: boolean;
  error: Error | null;
}

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

// Class component — required because React Error Boundaries must be class-based.
// useDefineForClassFields=false: DO NOT use field initialiser for state; use constructor instead.
class ErrorBoundaryInner extends React.Component {
  declare props: Props;
  declare state: State;

  constructor(p: any) {
    super(p);
    (this as any).state = { hasError: false, error: null } as State;
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary] Caught error:', error, info.componentStack);
  }

  handleReset = () => {
    (this as any).setState({ hasError: false, error: null });
  };

  render() {
    const s = (this as any).state as State;
    const p = (this as any).props as Props;

    if (s.hasError) {
      if (p.fallback) return p.fallback;

      return (
        <div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-[#050505] p-8 text-center">
          <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 max-w-lg w-full">
            <div className="mb-4 text-5xl">⚠️</div>
            <h2 className="mb-2 text-xl font-bold text-red-400">Component Error</h2>
            <p className="mb-4 text-sm text-gray-400">
              A rendering error occurred. The rest of the app is still functional.
            </p>
            <pre className="rounded-lg bg-black/50 p-4 text-left text-xs text-red-300 overflow-auto max-h-40">
              {s.error?.message ?? 'Unknown error'}
            </pre>
            <button
              onClick={this.handleReset}
              className="mt-4 rounded-lg border border-red-500/40 bg-red-500/20 px-4 py-2 text-sm font-semibold text-red-300 hover:bg-red-500/30 transition-colors"
            >
              Try Again
            </button>
          </div>
        </div>
      );
    }

    return p.children;
  }
}

export function ErrorBoundary(props: Props) {
  return React.createElement(ErrorBoundaryInner, props as any);
}
