"use client";

import {
  MagnifyingGlassIcon,
  XMarkIcon,
  FunnelIcon,
} from "@heroicons/react/24/solid";
import {
  Squares2X2Icon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { LibraryFilterPanel, type LibraryFilterPanelProps } from "./LibraryFilterPanel";

// ─── Sort / smart-filter constants ──────────────────────────────────────────

export const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Highest rated", value: "highest_rated" },
  { label: "Most played", value: "most_played" },
  { label: "Recently modified", value: "recently_modified" },
  { label: "Title A–Z", value: "title_az" },
] as const;

export const SMART_FILTER_OPTIONS = [
  { label: "This week", value: "this_week" },
  { label: "Unrated", value: "unrated" },
  { label: "Most played", value: "most_played" },
  { label: "Favorites", value: "favorites" },
  { label: "Archive", value: "archived" },
] as const;

// ─── Props ────────────────────────────────────────────────────────────────────

export interface LibraryToolbarProps extends LibraryFilterPanelProps {
  searchText: string;
  setSearchText: (v: string) => void;
  setShowFilters: React.Dispatch<React.SetStateAction<boolean>>;
  viewMode: "list" | "grid";
  setViewMode: (v: "list" | "grid") => void;
  smartFilter: string;
  setSmartFilter: (v: string) => void;
  includeVariations: boolean;
  setIncludeVariations: React.Dispatch<React.SetStateAction<boolean>>;
  sortBy: string;
  setSortBy: (v: string) => void;
  hasAnyFilter: boolean;
  clearAllFilters: () => void;
}

// ─── LibraryToolbar ──────────────────────────────────────────────────────────

export function LibraryToolbar({
  searchText,
  setSearchText,
  showFilters,
  setShowFilters,
  hasActiveFilters,
  viewMode,
  setViewMode,
  smartFilter,
  setSmartFilter,
  includeVariations,
  setIncludeVariations,
  sortBy,
  setSortBy,
  hasAnyFilter,
  clearAllFilters,
  // Filter panel props (forwarded)
  statusFilter,
  setStatusFilter,
  ratingFilter,
  setRatingFilter,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  availableTags,
  tagFilter,
  setTagFilter,
  genreFilter,
  setGenreFilter,
  moodFilter,
  setMoodFilter,
  tempoMin,
  setTempoMin,
  tempoMax,
  setTempoMax,
}: LibraryToolbarProps) {
  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" aria-hidden="true" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Search titles, lyrics, tags, prompts…"
            aria-label="Search songs"
            className="w-full pl-9 pr-9 py-2.5 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent min-h-[44px]"
          />
          {searchText && (
            <button
              onClick={() => setSearchText("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              aria-label="Clear search"
            >
              <XMarkIcon className="w-4 h-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setShowFilters((f) => !f)}
          aria-label={showFilters ? "Hide filters" : "Show filters"}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
            showFilters || hasActiveFilters
              ? "bg-violet-600 text-white"
              : "bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          <FunnelIcon className="w-4 h-4" />
          Filters
          {hasActiveFilters && !showFilters && (
            <span className="w-2 h-2 rounded-full bg-white" />
          )}
        </button>

        {/* View mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
          <button
            onClick={() => { setViewMode("list"); localStorage.setItem("library-view-mode", "list"); }}
            aria-label="List view"
            aria-pressed={viewMode === "list"}
            className={`flex items-center justify-center w-10 min-h-[44px] transition-colors ${viewMode === "list" ? "bg-violet-600 text-white" : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
          >
            <ListBulletIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => { setViewMode("grid"); localStorage.setItem("library-view-mode", "grid"); }}
            aria-label="Grid view"
            aria-pressed={viewMode === "grid"}
            className={`flex items-center justify-center w-10 min-h-[44px] transition-colors ${viewMode === "grid" ? "bg-violet-600 text-white" : "bg-white dark:bg-gray-900 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"}`}
          >
            <Squares2X2Icon className="w-4 h-4" />
          </button>
        </div>
      </div>

      <LibraryFilterPanel
        showFilters={showFilters}
        statusFilter={statusFilter}
        setStatusFilter={setStatusFilter}
        ratingFilter={ratingFilter}
        setRatingFilter={setRatingFilter}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        availableTags={availableTags}
        tagFilter={tagFilter}
        setTagFilter={setTagFilter}
        genreFilter={genreFilter}
        setGenreFilter={setGenreFilter}
        moodFilter={moodFilter}
        setMoodFilter={setMoodFilter}
        tempoMin={tempoMin}
        setTempoMin={setTempoMin}
        tempoMax={tempoMax}
        setTempoMax={setTempoMax}
        hasActiveFilters={hasActiveFilters}
      />

      {/* Smart filter chips */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {SMART_FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setSmartFilter(smartFilter === opt.value ? "" : opt.value)}
            className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[44px] ${
              smartFilter === opt.value
                ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-1 ring-violet-400"
                : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => setIncludeVariations((v) => !v)}
          aria-pressed={includeVariations}
          className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[44px] ${
            includeVariations
              ? "bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 ring-1 ring-violet-400"
              : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          + Variations
        </button>
      </div>

      {/* Sort + Clear row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2 overflow-x-auto pb-1">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setSortBy(opt.value)}
              className={`flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-colors min-h-[44px] ${
                sortBy === opt.value
                  ? "bg-violet-600 text-white"
                  : "bg-gray-200 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {hasAnyFilter && (
          <button
            onClick={clearAllFilters}
            className="flex-shrink-0 ml-2 px-3 py-1.5 rounded-full text-sm font-medium text-red-500 hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors min-h-[44px]"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
