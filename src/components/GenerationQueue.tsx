"use client";

import {
  QueueListIcon,
  XMarkIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  MusicalNoteIcon,
} from "@heroicons/react/24/outline";
import {
  CheckCircleIcon,
  ExclamationCircleIcon,
} from "@heroicons/react/24/solid";
import type { QueueItem } from "@/hooks/useGenerationQueue";

function QueueItemStatus({ status }: { status: QueueItem["status"] }) {
  switch (status) {
    case "processing":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-violet-600 dark:text-violet-400">
          <svg
            className="animate-spin h-3.5 w-3.5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Generating
        </span>
      );
    case "done":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-green-600 dark:text-green-400">
          <CheckCircleIcon className="h-3.5 w-3.5" />
          Done
        </span>
      );
    case "failed":
      return (
        <span className="flex items-center gap-1 text-xs font-medium text-red-600 dark:text-red-400">
          <ExclamationCircleIcon className="h-3.5 w-3.5" />
          Failed
        </span>
      );
    default:
      return (
        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
          Queued
        </span>
      );
  }
}

export function GenerationQueue({
  items,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  items: QueueItem[];
  onRemove: (id: string) => void;
  onMoveUp: (index: number) => void;
  onMoveDown: (index: number) => void;
}) {
  if (items.length === 0) return null;

  const activeItems = items.filter(
    (i) => i.status === "pending" || i.status === "processing"
  );
  const processingIndex = activeItems.findIndex(
    (i) => i.status === "processing"
  );

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <QueueListIcon className="h-5 w-5 text-violet-500" />
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Generation Queue
        </h3>
        {processingIndex >= 0 && (
          <span className="text-xs text-gray-500 dark:text-gray-400">
            Processing {processingIndex + 1} of {activeItems.length}
          </span>
        )}
      </div>

      <div className="space-y-2">
        {activeItems.map((item, index) => (
          <div
            key={item.id}
            className={`flex items-center gap-3 rounded-lg p-2.5 border ${
              item.status === "processing"
                ? "border-violet-300 dark:border-violet-700 bg-violet-50 dark:bg-violet-900/20"
                : "border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30"
            }`}
          >
            <div className="flex-shrink-0 h-8 w-8 rounded-md bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <MusicalNoteIcon className="h-4 w-4 text-gray-500 dark:text-gray-400" />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {item.title || "Untitled"}
              </p>
              <div className="flex items-center gap-2">
                <QueueItemStatus status={item.status} />
                {item.tags && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500 truncate max-w-[120px]">
                    {item.tags}
                  </span>
                )}
              </div>
            </div>

            {/* Reorder buttons — only for pending items */}
            {item.status === "pending" && (
              <div className="flex flex-col gap-0.5">
                <button
                  type="button"
                  onClick={() => onMoveUp(index)}
                  disabled={index === 0 || activeItems[0]?.status === "processing" && index === 1}
                  className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
                  aria-label="Move up"
                >
                  <ChevronUpIcon className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => onMoveDown(index)}
                  disabled={index === activeItems.length - 1}
                  className="p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:opacity-30"
                  aria-label="Move down"
                >
                  <ChevronDownIcon className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* Cancel button */}
            <button
              type="button"
              onClick={() => onRemove(item.id)}
              className="p-1 text-gray-400 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              aria-label="Remove from queue"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
