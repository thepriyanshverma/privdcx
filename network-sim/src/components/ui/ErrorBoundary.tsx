import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: any) {
    console.error('[ErrorBoundary] Caught crash:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center text-slate-300 font-mono p-8">
          <div className="max-w-2xl w-full bg-slate-800 border border-red-500/40 rounded-xl p-6">
            <h1 className="text-red-400 text-lg font-bold mb-2">⚠ Runtime Error</h1>
            <p className="text-slate-400 text-sm mb-4">The application encountered an unexpected error. Check the browser console for details.</p>
            <pre className="bg-slate-950 p-3 rounded text-xs text-red-300 overflow-auto max-h-48 whitespace-pre-wrap">
              {this.state.error?.message}
              {'\n\n'}
              {this.state.error?.stack?.split('\n').slice(0, 8).join('\n')}
            </pre>
            <button 
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-4 px-4 py-2 bg-slate-700 border border-slate-600 rounded text-sm hover:bg-slate-600 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
