/** Reusable skeleton primitives with shimmer animation. */

function shimmerClass(className?: string) {
  return `bg-gradient-to-r from-gray-200 via-gray-300 to-gray-200 dark:from-gray-800 dark:via-gray-700 dark:to-gray-800 bg-[length:200%_100%] animate-shimmer rounded ${className ?? ""}`.trim();
}

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={shimmerClass(className)} style={style} />;
}

/** Skeleton matching a song card in the library list. */
export function SongCardSkeleton() {
  return (
    <li className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center gap-3 px-3 pt-3 pb-3">
        {/* Cover art placeholder */}
        <Skeleton className="flex-shrink-0 w-12 h-12 rounded-lg" />
        {/* Title + meta */}
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-4 w-3/4 rounded" />
          <Skeleton className="h-3 w-1/2 rounded" />
        </div>
        {/* Action button placeholders */}
        <Skeleton className="flex-shrink-0 w-11 h-11 rounded-full" />
        <Skeleton className="flex-shrink-0 w-11 h-11 rounded-full" />
      </div>
    </li>
  );
}

/** Skeleton for the library page (header + filter chips + song list). */
export function LibrarySkeleton() {
  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div>
        <Skeleton className="h-6 w-24 rounded" />
        <Skeleton className="h-4 w-16 rounded mt-1.5" />
      </div>
      {/* Filter chips */}
      <div className="flex gap-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full flex-shrink-0" />
        ))}
      </div>
      {/* Song cards */}
      <ul className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <SongCardSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}

/** Skeleton for the song detail page. */
export function SongDetailSkeleton() {
  return (
    <div className="px-4 py-4 space-y-5">
      {/* Back link */}
      <Skeleton className="h-5 w-16 rounded" />
      {/* Cover art */}
      <Skeleton className="w-full aspect-square max-h-64 rounded-2xl" />
      {/* Title + meta */}
      <div>
        <Skeleton className="h-7 w-3/4 rounded" />
        <div className="flex gap-3 mt-2">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-4 w-12 rounded" />
        </div>
      </div>
      {/* Regenerate button */}
      <Skeleton className="h-11 w-full rounded-xl" />
      {/* Audio player card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <Skeleton className="w-12 h-12 rounded-full" />
          <Skeleton className="h-4 w-20 rounded" />
        </div>
        <Skeleton className="h-1.5 w-full rounded-full" />
        <div className="flex justify-between">
          <Skeleton className="h-3 w-10 rounded" />
          <Skeleton className="h-3 w-10 rounded" />
        </div>
      </div>
      {/* Lyrics card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
        <Skeleton className="h-4 w-12 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-5/6 rounded" />
        <Skeleton className="h-3 w-4/6 rounded" />
      </div>
      {/* Prompt card */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
        <Skeleton className="h-4 w-14 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
      </div>
    </div>
  );
}

// ─── Reusable skeleton primitives ────────────────────────────────────────────

/** Generic card skeleton — matches the standard card container used across pages. */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div className={`bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3 ${className ?? ""}`}>
      <Skeleton className="h-4 w-3/4 rounded" />
      <Skeleton className="h-3 w-1/2 rounded" />
      <Skeleton className="h-3 w-2/3 rounded" />
    </div>
  );
}

/** Table skeleton with header row and body rows. */
export function SkeletonTable({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex gap-4 px-4 py-3 border-b border-gray-100 dark:border-gray-800">
        <Skeleton className="h-3 w-1/4 rounded" />
        <Skeleton className="h-3 w-1/4 rounded" />
        <Skeleton className="h-3 w-1/6 rounded" />
        <Skeleton className="h-3 w-1/6 rounded" />
      </div>
      {/* Rows */}
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-gray-50 dark:border-gray-800/50 last:border-b-0">
          <Skeleton className="h-3 w-1/4 rounded" />
          <Skeleton className="h-3 w-1/4 rounded" />
          <Skeleton className="h-3 w-1/6 rounded" />
          <Skeleton className="h-3 w-1/6 rounded" />
        </div>
      ))}
    </div>
  );
}

/** Text block skeleton — simulates paragraph lines. */
export function SkeletonText({ lines = 3 }: { lines?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton
          key={i}
          className={`h-3 rounded ${i === lines - 1 ? "w-2/3" : "w-full"}`}
        />
      ))}
    </div>
  );
}

/** Circular avatar skeleton. */
export function SkeletonAvatar({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClass = size === "sm" ? "w-8 h-8" : size === "lg" ? "w-16 h-16" : "w-12 h-12";
  return <Skeleton className={`${sizeClass} rounded-full`} />;
}

// ─── Page-specific skeletons ─────────────────────────────────────────────────

/** Skeleton for the dashboard page — stat cards, tags, chart, recent songs. */
export function DashboardSkeleton() {
  return (
    <div className="px-4 py-6 space-y-6">
      {/* Greeting */}
      <div>
        <Skeleton className="h-6 w-48 rounded" />
        <Skeleton className="h-4 w-32 rounded mt-1.5" />
      </div>
      {/* Stat cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl px-4 py-5">
            <Skeleton className="h-3 w-16 rounded" />
            <Skeleton className="h-7 w-12 rounded mt-2" />
          </div>
        ))}
      </div>
      {/* Top tags */}
      <div>
        <Skeleton className="h-5 w-20 rounded mb-3" />
        <div className="flex flex-wrap gap-2">
          <Skeleton className="h-7 w-12 rounded-full" />
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="h-7 w-20 rounded-full" />
          <Skeleton className="h-7 w-14 rounded-full" />
          <Skeleton className="h-7 w-24 rounded-full" />
        </div>
      </div>
      {/* Usage chart */}
      <div>
        <Skeleton className="h-5 w-48 rounded mb-3" />
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <div className="flex items-end gap-1.5 h-32">
            {["h-[20%]", "h-[28%]", "h-[36%]", "h-[44%]", "h-[52%]", "h-[60%]", "h-[68%]"].map((h, i) => (
              <div key={i} className="flex-1 flex flex-col items-center gap-1 h-full justify-end">
                <Skeleton className={`w-full rounded-t-md ${h}`} />
                <Skeleton className="h-3 w-6 rounded" />
              </div>
            ))}
          </div>
        </div>
      </div>
      {/* Recent songs */}
      <div>
        <Skeleton className="h-5 w-28 rounded mb-3" />
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden divide-y divide-gray-100 dark:divide-gray-800">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 px-3 py-3">
              <Skeleton className="w-10 h-10 rounded-lg flex-shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3.5 w-32 rounded" />
                <Skeleton className="h-3 w-20 rounded" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Skeleton for the history page — header, filter chips, history rows. */
export function HistorySkeleton() {
  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div>
        <Skeleton className="h-6 w-20 rounded" />
        <Skeleton className="h-4 w-24 rounded mt-1" />
      </div>
      {/* Filter chips */}
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-20 rounded-full flex-shrink-0" />
        ))}
      </div>
      {/* History rows */}
      <ul className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <li key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-start gap-3 px-3 py-3">
              <Skeleton className="flex-shrink-0 w-12 h-12 rounded-lg" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <div className="flex items-center gap-2">
                  <Skeleton className="h-4 w-32 rounded" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
                <Skeleton className="h-3 w-full rounded" />
                <div className="flex items-center gap-3">
                  <Skeleton className="h-3 w-16 rounded" />
                  <Skeleton className="h-3 w-10 rounded" />
                  <Skeleton className="h-3 w-14 rounded" />
                </div>
              </div>
              <Skeleton className="flex-shrink-0 w-11 h-11 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Skeleton for the playlists page — header, playlist items. */
export function PlaylistsSkeleton() {
  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-24 rounded" />
          <Skeleton className="h-4 w-20 rounded mt-1" />
        </div>
        <Skeleton className="h-10 w-16 rounded-lg" />
      </div>
      {/* Playlist items */}
      <ul className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3">
              <Skeleton className="flex-shrink-0 w-12 h-12 rounded-lg" />
              <div className="flex-1 min-w-0 space-y-1.5">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-48 rounded" />
                <Skeleton className="h-3 w-16 rounded" />
              </div>
              <Skeleton className="flex-shrink-0 w-11 h-11 rounded-full" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Skeleton for the user profile page — avatar, stats grid, form sections. */
export function ProfileSkeleton() {
  return (
    <div className="px-4 py-6 space-y-8">
      {/* Avatar + name + email */}
      <div className="flex flex-col items-center gap-3 pt-2">
        <Skeleton className="w-20 h-20 rounded-full" />
        <Skeleton className="h-6 w-32 rounded" />
        <Skeleton className="h-4 w-48 rounded" />
      </div>
      <div className="border-t border-gray-200 dark:border-gray-800" />
      {/* Account stats */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-28 rounded" />
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
              <Skeleton className="w-5 h-5 rounded" />
              <Skeleton className="h-5 w-8 rounded" />
              <Skeleton className="h-3 w-14 rounded" />
            </div>
          ))}
        </div>
      </div>
      <div className="border-t border-gray-200 dark:border-gray-800" />
      {/* Change password form */}
      <div className="space-y-3">
        <Skeleton className="h-5 w-36 rounded" />
        <Skeleton className="h-4 w-44 rounded" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
          <Skeleton className="h-10 w-full rounded-lg" />
        </div>
      </div>
    </div>
  );
}

/** Skeleton for a playlist detail page — back link, header, song list. */
export function PlaylistDetailSkeleton() {
  return (
    <div className="px-4 py-4 space-y-4">
      {/* Back link */}
      <Skeleton className="h-5 w-24 rounded" />
      {/* Playlist header */}
      <div className="flex items-center gap-3">
        <Skeleton className="flex-shrink-0 w-16 h-16 rounded-lg" />
        <div className="flex-1 min-w-0 space-y-2">
          <Skeleton className="h-6 w-40 rounded" />
          <Skeleton className="h-3 w-24 rounded" />
        </div>
        <Skeleton className="w-11 h-11 rounded-full" />
      </div>
      {/* Song list */}
      <ul className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <SongCardSkeleton key={i} />
        ))}
      </ul>
    </div>
  );
}

/** Skeleton for the generate page form. */
export function GenerateFormSkeleton() {
  return (
    <div className="px-4 py-4 space-y-6">
      {/* Header */}
      <div>
        <Skeleton className="h-6 w-24 rounded" />
        <Skeleton className="h-4 w-44 rounded mt-1.5" />
      </div>
      {/* Form fields */}
      <div className="space-y-4">
        <div className="space-y-1">
          <Skeleton className="h-4 w-28 rounded" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <div className="space-y-1">
          <Skeleton className="h-4 w-24 rounded" />
          <Skeleton className="h-11 w-full rounded-xl" />
        </div>
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-13 w-full rounded-xl" />
      </div>
    </div>
  );
}

/** Skeleton for the songs gallery page — header, search bar, album art grid. */
export function SongsGallerySkeleton() {
  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div>
        <Skeleton className="h-6 w-16 rounded" />
        <Skeleton className="h-4 w-20 rounded mt-1" />
      </div>
      {/* Search + filter bar */}
      <div className="flex gap-2">
        <Skeleton className="h-11 flex-1 rounded-xl" />
        <Skeleton className="h-11 w-11 rounded-xl" />
      </div>
      {/* Gallery grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden">
            <Skeleton className="aspect-square w-full" />
            <div className="p-3 space-y-2">
              <Skeleton className="h-4 w-3/4 rounded" />
              <Skeleton className="h-3 w-1/2 rounded" />
              <div className="flex justify-between items-center">
                <Skeleton className="h-3 w-16 rounded" />
                <div className="flex gap-1">
                  <Skeleton className="w-8 h-8 rounded-full" />
                  <Skeleton className="w-8 h-8 rounded-full" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
