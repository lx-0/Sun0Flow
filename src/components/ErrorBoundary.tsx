"use client";

import { Component, type ReactNode } from "react";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { logError } from "@/lib/error-logger";

interface Props {
  children: ReactNode;
  /** Compact inline fallback (default). Pass a custom element to override. */
  fallback?: ReactNode;
  /** Source label for error logging */
  source?: string;
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

  componentDidCatch(error: Error) {
    logError(this.props.source ?? "error-boundary", error);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback !== undefined) return this.props.fallback;

      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <ExclamationTriangleIcon className="w-8 h-8 text-red-400" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Something went wrong loading this section.
          </p>
          <button
            onClick={this.handleReset}
            className="px-3 py-1.5 text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white rounded-lg transition-colors"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
