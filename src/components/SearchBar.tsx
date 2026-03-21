"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlassIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { MusicalNoteIcon, QueueListIcon } from "@heroicons/react/24/outline";

interface SongResult {
  id: string;
  title: string | null;
  prompt: string | null;
  imageUrl: string | null;
  generationStatus: string;
}

interface PlaylistResult {
  id: string;
  name: string;
  description: string | null;
  _count: { songs: number };
}

const RECENT_SEARCHES_KEY = "sunoflow-recent-searches";
const MAX_RECENT = 5;

function getRecentSearches(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_SEARCHES_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

function saveRecentSearch(term: string) {
  try {
    const recent = getRecentSearches().filter((s) => s !== term);
    recent.unshift(term);
    localStorage.setItem(
      RECENT_SEARCHES_KEY,
      JSON.stringify(recent.slice(0, MAX_RECENT))
    );
  } catch {
    // localStorage unavailable
  }
}

export function SearchBar() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [songs, setSongs] = useState<SongResult[]>([]);
  const [playlists, setPlaylists] = useState<PlaylistResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Total navigable items count
  const totalItems = songs.length + playlists.length;

  // Load recent searches when dropdown opens
  useEffect(() => {
    if (open && !query) {
      setRecentSearches(getRecentSearches());
    }
  }, [open, query]);

  // Cmd+K / Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Close on click outside
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) {
      setSongs([]);
      setPlaylists([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setSelectedIndex(-1);

    const timer = setTimeout(() => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      fetch(`/api/search?q=${encodeURIComponent(query.trim())}`, {
        signal: controller.signal,
      })
        .then((res) => res.json())
        .then((data) => {
          setSongs(data.songs || []);
          setPlaylists(data.playlists || []);
          setLoading(false);
        })
        .catch((err) => {
          if (err.name !== "AbortError") setLoading(false);
        });
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const navigate = useCallback(
    (path: string, term?: string) => {
      if (term) saveRecentSearch(term);
      setOpen(false);
      setQuery("");
      router.push(path);
    },
    [router]
  );

  // Keyboard navigation in results
  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : totalItems - 1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      e.preventDefault();
      if (selectedIndex < songs.length) {
        navigate(`/library?song=${songs[selectedIndex].id}`, query);
      } else {
        const pi = selectedIndex - songs.length;
        navigate(`/playlists/${playlists[pi].id}`, query);
      }
    }
  }

  const hasResults = songs.length > 0 || playlists.length > 0;
  const showDropdown = open && (query.trim() || recentSearches.length > 0);

  return (
    <div ref={containerRef} className="relative w-full max-w-md">
      {/* Search input */}
      <div className="relative">
        <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          ref={inputRef}
          type="search"
          role="combobox"
          aria-label="Search songs and playlists"
          aria-expanded={showDropdown ? true : false}
          aria-controls="search-results"
          aria-autocomplete="list"
          aria-activedescendant={
            selectedIndex >= 0 ? `search-item-${selectedIndex}` : undefined
          }
          placeholder="Search… (⌘K)"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            if (!open) setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={handleKeyDown}
          className="w-full pl-9 pr-8 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-400 focus:border-transparent transition-colors"
        />
        {query && (
          <button
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Dropdown */}
      {showDropdown && (
        <div
          id="search-results"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg max-h-80 overflow-y-auto z-50"
        >
          {/* Recent searches (when no query) */}
          {!query.trim() && recentSearches.length > 0 && (
            <div className="p-2">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 px-2 py-1">
                Recent searches
              </p>
              {recentSearches.map((term) => (
                <button
                  key={term}
                  onClick={() => {
                    setQuery(term);
                    setOpen(true);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                >
                  {term}
                </button>
              ))}
            </div>
          )}

          {/* Loading */}
          {query.trim() && loading && (
            <p className="px-4 py-3 text-sm text-gray-400">Searching…</p>
          )}

          {/* Results */}
          {query.trim() && !loading && hasResults && (
            <>
              {songs.length > 0 && (
                <div className="p-2">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 px-2 py-1">
                    Songs
                  </p>
                  {songs.map((song, i) => (
                    <button
                      key={song.id}
                      id={`search-item-${i}`}
                      role="option"
                      aria-selected={selectedIndex === i}
                      onClick={() =>
                        navigate(`/library?song=${song.id}`, query)
                      }
                      className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                        selectedIndex === i
                          ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                          : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                      }`}
                    >
                      {song.imageUrl ? (
                        <img
                          src={song.imageUrl}
                          alt=""
                          className="w-8 h-8 rounded object-cover flex-shrink-0"
                        />
                      ) : (
                        <MusicalNoteIcon className="w-8 h-8 p-1.5 text-gray-400 bg-gray-100 dark:bg-gray-800 rounded flex-shrink-0" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {song.title || "Untitled"}
                        </p>
                        {song.prompt && (
                          <p className="truncate text-xs text-gray-400">
                            {song.prompt}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {playlists.length > 0 && (
                <div className="p-2">
                  <p className="text-xs font-medium text-gray-400 dark:text-gray-500 px-2 py-1">
                    Playlists
                  </p>
                  {playlists.map((pl, i) => {
                    const idx = songs.length + i;
                    return (
                      <button
                        key={pl.id}
                        id={`search-item-${idx}`}
                        role="option"
                        aria-selected={selectedIndex === idx}
                        onClick={() =>
                          navigate(`/playlists/${pl.id}`, query)
                        }
                        className={`w-full text-left flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                          selectedIndex === idx
                            ? "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300"
                            : "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800"
                        }`}
                      >
                        <QueueListIcon className="w-8 h-8 p-1.5 text-gray-400 bg-gray-100 dark:bg-gray-800 rounded flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{pl.name}</p>
                          <p className="text-xs text-gray-400">
                            {pl._count.songs} song{pl._count.songs !== 1 ? "s" : ""}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {/* Empty state */}
          {query.trim() && !loading && !hasResults && (
            <p className="px-4 py-3 text-sm text-gray-400">
              No results for &ldquo;{query}&rdquo;
            </p>
          )}
        </div>
      )}
    </div>
  );
}
