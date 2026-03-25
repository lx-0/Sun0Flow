"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { logError } from "@/lib/error-logger";

export default function DiscoverError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logError("error-boundary:discover", error);
  }, [error]);
  return (
    <div className="px-4 py-12 flex flex-col items-center text-center space-y-4">
      <ExclamationTriangleIcon className="w-10 h-10 text-red-400" />
      <h2 className="text-lg font-bold">Failed to load Discover</h2>
      <p className="text-gray-500 dark:text-gray-400 text-sm">
        Something went wrong loading public songs. Please try again.
      </p>
      <div className="flex gap-2">
        <button
          onClick={reset}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
        >
          Try Again
        </button>
        <Link
          href="/"
          className="px-4 py-2 bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white text-sm font-medium rounded-lg transition-colors"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
