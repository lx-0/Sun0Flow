"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { QueueListIcon } from "@heroicons/react/24/outline";
import { PlusIcon, ChevronDownIcon } from "@heroicons/react/24/solid";
import { useToast } from "./Toast";
import { track } from "@/lib/analytics";

interface PlaylistOption {
  id: string;
  name: string;
  _count: { songs: number };
}

interface AddToPlaylistButtonProps {
  songId: string;
  songTitle?: string;
  /** "icon" = compact round icon button (LibraryView style).
   *  "button" = full pill button with text (SongDetailView style). */
  variant?: "icon" | "button";
}

export function AddToPlaylistButton({
  songId,
  variant = "icon",
}: AddToPlaylistButtonProps) {
  const { data: session } = useSession();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [open]);

  async function handleOpen() {
    setOpen((prev) => !prev);
    if (!open) {
      setLoading(true);
      try {
        const res = await fetch("/api/playlists");
        if (res.ok) {
          const data = await res.json();
          setPlaylists(data.playlists ?? []);
        }
      } finally {
        setLoading(false);
      }
    }
  }

  async function handleAdd(playlistId: string) {
    setAdding(playlistId);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error ?? "Failed to add to playlist", "error");
      } else {
        track("playlist_song_added", { playlistId });
        toast("Added to playlist", "success");
        setOpen(false);
      }
    } catch {
      toast("Failed to add to playlist", "error");
    } finally {
      setAdding(null);
    }
  }

  // Hide entirely when not logged in
  if (!session) return null;

  return (
    <div className="relative" ref={menuRef}>
      {variant === "icon" ? (
        <button
          onClick={handleOpen}
          aria-label="Add to playlist"
          className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-violet-400 transition-colors"
        >
          <QueueListIcon className="w-5 h-5" aria-hidden="true" />
        </button>
      ) : (
        <button
          onClick={handleOpen}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 active:scale-95 min-h-[44px]"
        >
          <PlusIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          Add to playlist
          <ChevronDownIcon className="w-3 h-3" aria-hidden="true" />
        </button>
      )}

      {open && (
        <div
          className={
            variant === "icon"
              ? "absolute right-0 bottom-full mb-1 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden"
              : "absolute top-full left-0 mt-1 w-56 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl z-20 py-1 max-h-60 overflow-y-auto"
          }
        >
          {loading ? (
            <p className="px-4 py-3 text-sm text-gray-500">Loading…</p>
          ) : playlists.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">No playlists yet</p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handleAdd(pl.id)}
                disabled={adding === pl.id}
                className={
                  variant === "icon"
                    ? "w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b last:border-b-0 border-gray-200 dark:border-gray-800 disabled:opacity-50"
                    : "w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-between"
                }
              >
                <span className="truncate">{pl.name}</span>
                <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0 ml-2">
                  {variant === "icon"
                    ? `(${pl._count.songs})`
                    : `${pl._count.songs} songs`}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
