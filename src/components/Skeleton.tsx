/** Reusable skeleton primitives with shimmer animation. */

function shimmerClass(className?: string) {
  return `bg-gradient-to-r from-gray-800 via-gray-700 to-gray-800 bg-[length:200%_100%] animate-shimmer rounded ${className ?? ""}`.trim();
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={shimmerClass(className)} />;
}

/** Skeleton matching a song card in the library list. */
export function SongCardSkeleton() {
  return (
    <li className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-3">
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
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
        <Skeleton className="h-4 w-12 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-5/6 rounded" />
        <Skeleton className="h-3 w-4/6 rounded" />
      </div>
      {/* Prompt card */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 space-y-2">
        <Skeleton className="h-4 w-14 rounded" />
        <Skeleton className="h-3 w-full rounded" />
        <Skeleton className="h-3 w-2/3 rounded" />
      </div>
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
