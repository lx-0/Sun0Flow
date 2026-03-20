"use client";

import { useEffect } from "react";
import { logError } from "@/lib/error-logger";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("global-error-boundary", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-sm space-y-4">
          <div className="text-4xl">!</div>
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            An unexpected error occurred. Please try again.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Try Again
            </button>
            <a
              href="/"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
            >
              Go Home
            </a>
          </div>
        </div>
      </body>
    </html>
  );
}
