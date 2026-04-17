"use client";

import { XMarkIcon } from "@heroicons/react/24/solid";

// ─── Constants ────────────────────────────────────────────────────────────────

export const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Ready", value: "ready" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
] as const;

export const RATING_OPTIONS = [
  { label: "Any rating", value: "" },
  { label: "1★+", value: "1" },
  { label: "2★+", value: "2" },
  { label: "3★+", value: "3" },
  { label: "4★+", value: "4" },
  { label: "5★", value: "5" },
] as const;

export const GENRE_OPTIONS = [
  "Pop", "Rock", "Hip-Hop", "Electronic", "Jazz", "Classical", "Country",
  "R&B", "Metal", "Folk", "Blues", "Reggae", "Indie", "Ambient", "EDM",
  "Soul", "Funk", "Latin", "Punk", "Alternative",
];

export const MOOD_OPTIONS = [
  "Happy", "Sad", "Energetic", "Calm", "Romantic", "Dark", "Upbeat",
  "Chill", "Melancholic", "Aggressive", "Dreamy", "Nostalgic", "Epic",
  "Peaceful", "Intense",
];

export const TEMPO_MIN = 60;
export const TEMPO_MAX = 200;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AvailableTag {
  id: string;
  name: string;
  color: string;
  _count?: { songTags?: number };
}

export interface LibraryFilterPanelProps {
  showFilters: boolean;
  statusFilter: string;
  setStatusFilter: (v: string) => void;
  ratingFilter: string;
  setRatingFilter: (v: string) => void;
  dateFrom: string;
  setDateFrom: (v: string) => void;
  dateTo: string;
  setDateTo: (v: string) => void;
  availableTags: AvailableTag[];
  tagFilter: string[];
  setTagFilter: React.Dispatch<React.SetStateAction<string[]>>;
  genreFilter: string[];
  setGenreFilter: React.Dispatch<React.SetStateAction<string[]>>;
  moodFilter: string[];
  setMoodFilter: React.Dispatch<React.SetStateAction<string[]>>;
  tempoMin: string;
  setTempoMin: (v: string) => void;
  tempoMax: string;
  setTempoMax: (v: string) => void;
  hasActiveFilters: boolean;
}

// ─── LibraryFilterPanel ──────────────────────────────────────────────────────

export function LibraryFilterPanel({
  showFilters,
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
  hasActiveFilters,
}: LibraryFilterPanelProps) {
  return (
    <>
      {showFilters && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white min-h-[44px]"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <select
              value={ratingFilter}
              onChange={(e) => setRatingFilter(e.target.value)}
              aria-label="Filter by rating"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white min-h-[44px]"
            >
              {RATING_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>

            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              placeholder="From"
              aria-label="Filter from date"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white min-h-[44px]"
            />

            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              placeholder="To"
              aria-label="Filter to date"
              className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white min-h-[44px]"
            />
          </div>

          {/* Tag multi-select */}
          {availableTags.length > 0 && (
            <div>
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Tags</p>
              <div className="flex flex-wrap gap-1.5">
                {availableTags.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setTagFilter((prev) => prev.includes(t.id) ? prev.filter((x) => x !== t.id) : [...prev, t.id])}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                      tagFilter.includes(t.id)
                        ? "text-white"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                    }`}
                    style={tagFilter.includes(t.id) ? { backgroundColor: t.color } : undefined}
                  >
                    {t.name}
                    {t._count?.songTags != null && (
                      <span className={`ml-1 ${tagFilter.includes(t.id) ? "opacity-75" : "text-gray-400 dark:text-gray-500"}`}>
                        {t._count.songTags}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Genre multi-select */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Genre</p>
            <div className="flex flex-wrap gap-1.5">
              {GENRE_OPTIONS.map((g) => (
                <button
                  key={g}
                  onClick={() => setGenreFilter((prev) => prev.includes(g) ? prev.filter((x) => x !== g) : [...prev, g])}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    genreFilter.includes(g)
                      ? "bg-violet-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {g}
                </button>
              ))}
            </div>
          </div>

          {/* Mood multi-select */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">Mood</p>
            <div className="flex flex-wrap gap-1.5">
              {MOOD_OPTIONS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMoodFilter((prev) => prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m])}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    moodFilter.includes(m)
                      ? "bg-violet-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Tempo range */}
          <div>
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1.5">
              Tempo (BPM){tempoMin || tempoMax ? `: ${tempoMin || TEMPO_MIN}–${tempoMax || TEMPO_MAX}` : ""}
            </p>
            <div className="flex items-center gap-3">
              <span className="text-xs text-gray-400 w-8">{TEMPO_MIN}</span>
              <div className="flex-1 flex items-center gap-2">
                <input
                  type="range"
                  min={TEMPO_MIN}
                  max={TEMPO_MAX}
                  step={5}
                  value={tempoMin || TEMPO_MIN}
                  onChange={(e) => {
                    const v = e.target.value;
                    const max = parseInt(tempoMax || String(TEMPO_MAX), 10);
                    if (parseInt(v, 10) <= max) setTempoMin(v === String(TEMPO_MIN) ? "" : v);
                  }}
                  aria-label="Minimum tempo"
                  className="flex-1 accent-violet-600"
                />
                <input
                  type="range"
                  min={TEMPO_MIN}
                  max={TEMPO_MAX}
                  step={5}
                  value={tempoMax || TEMPO_MAX}
                  onChange={(e) => {
                    const v = e.target.value;
                    const min = parseInt(tempoMin || String(TEMPO_MIN), 10);
                    if (parseInt(v, 10) >= min) setTempoMax(v === String(TEMPO_MAX) ? "" : v);
                  }}
                  aria-label="Maximum tempo"
                  className="flex-1 accent-violet-600"
                />
              </div>
              <span className="text-xs text-gray-400 w-8 text-right">{TEMPO_MAX}</span>
            </div>
          </div>
        </div>
      )}

      {/* Active filter chips */}
      {hasActiveFilters && (
        <div className="flex flex-wrap gap-1.5">
          {genreFilter.map((g) => (
            <span key={g} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300">
              {g}
              <button onClick={() => setGenreFilter((prev) => prev.filter((x) => x !== g))} aria-label={`Remove ${g} filter`} className="hover:text-violet-500">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
          {moodFilter.map((m) => (
            <span key={m} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
              {m}
              <button onClick={() => setMoodFilter((prev) => prev.filter((x) => x !== m))} aria-label={`Remove ${m} filter`} className="hover:text-blue-500">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          ))}
          {(tempoMin || tempoMax) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-300">
              {tempoMin || TEMPO_MIN}–{tempoMax || TEMPO_MAX} BPM
              <button onClick={() => { setTempoMin(""); setTempoMax(""); }} aria-label="Remove tempo filter" className="hover:text-green-500">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          )}
          {statusFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {STATUS_OPTIONS.find((o) => o.value === statusFilter)?.label ?? statusFilter}
              <button onClick={() => setStatusFilter("")} aria-label="Remove status filter" className="hover:text-gray-500">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          )}
          {ratingFilter && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-300">
              {RATING_OPTIONS.find((o) => o.value === ratingFilter)?.label ?? ratingFilter}
              <button onClick={() => setRatingFilter("")} aria-label="Remove rating filter" className="hover:text-yellow-500">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          )}
          {(dateFrom || dateTo) && (
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300">
              {dateFrom || "…"}–{dateTo || "…"}
              <button onClick={() => { setDateFrom(""); setDateTo(""); }} aria-label="Remove date filter" className="hover:text-gray-500">
                <XMarkIcon className="w-3 h-3" />
              </button>
            </span>
          )}
          {tagFilter.map((tid) => {
            const t = availableTags.find((x) => x.id === tid);
            if (!t) return null;
            return (
              <span key={tid} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium text-white" style={{ backgroundColor: t.color }}>
                #{t.name}
                <button onClick={() => setTagFilter((prev) => prev.filter((x) => x !== tid))} aria-label={`Remove ${t.name} tag filter`} className="hover:opacity-70">
                  <XMarkIcon className="w-3 h-3" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </>
  );
}
