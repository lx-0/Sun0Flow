"use client";

import {
  MusicalNoteIcon,
  TagIcon,
  CalendarIcon,
  ClockIcon,
} from "@heroicons/react/24/solid";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface SongMetadataCardProps {
  tags?: string | null;
  duration?: number | null;
  createdAt: string;
  model?: string | null;
  ratingStars: number;
  sunoJobId?: string | null;
}

// ─── SongMetadataCard ────────────────────────────────────────────────────────

export function SongMetadataCard({
  tags,
  duration,
  createdAt,
  model,
  ratingStars,
  sunoJobId,
}: SongMetadataCardProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 transition-shadow duration-200 hover:shadow-md">
      <div className="grid grid-cols-2 gap-3 text-sm">
        {tags && (
          <div className="flex items-start gap-2">
            <TagIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Style</span>
              <span className="text-gray-900 dark:text-white">{tags}</span>
            </div>
          </div>
        )}
        {duration != null && (
          <div className="flex items-start gap-2">
            <ClockIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Duration</span>
              <span className="text-gray-900 dark:text-white">{formatTime(duration)}</span>
            </div>
          </div>
        )}
        <div className="flex items-start gap-2">
          <CalendarIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
          <div>
            <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Created</span>
            <span className="text-gray-900 dark:text-white">{formatDate(createdAt)}</span>
          </div>
        </div>
        {model && (
          <div className="flex items-start gap-2">
            <MusicalNoteIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Model</span>
              <span className="text-gray-900 dark:text-white">{model}</span>
            </div>
          </div>
        )}
        {ratingStars > 0 && (
          <div className="flex items-start gap-2">
            <span className="text-violet-400 mt-0.5 flex-shrink-0 text-sm">★</span>
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Rating</span>
              <span className="text-yellow-400">{Array(ratingStars).fill("★").join("")}</span>
            </div>
          </div>
        )}
        {sunoJobId && (
          <div className="flex items-start gap-2 col-span-2">
            <span className="text-violet-400 mt-0.5 flex-shrink-0 text-xs font-mono">#</span>
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Suno ID</span>
              <span className="text-gray-900 dark:text-white font-mono text-xs">{sunoJobId}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
