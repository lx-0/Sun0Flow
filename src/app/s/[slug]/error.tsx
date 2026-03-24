"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { logError } from "@/lib/error-logger";

export default function SongPageError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("error-boundary:song-page", error);
  }, [error]);
  return (
    <div className="flex flex-col min-h-screen max-w-md mx-auto">
      <header className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 px-4 py-3">
        <span className="text-violet-400 font-bold text-lg tracking-tight">SunoFlow</span>
      </header>
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="text-center max-w-sm space-y-4">
          <ExclamationTriangleIcon className="w-10 h-10 text-red-400 mx-auto" />
          <h2 className="text-lg font-bold">Failed to load song</h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            Something went wrong loading this song. Please try again.
          </p>
          <div className="flex flex-col gap-2">
            <button
              onClick={reset}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
            >
              Try Again
            </button>
            <Link
              href="/"
              className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors text-center"
            >
              Go Home
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
