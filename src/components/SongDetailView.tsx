"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeftIcon,
  MusicalNoteIcon,
  ArrowDownTrayIcon,
  HeartIcon,
  ArrowPathIcon,
  ShareIcon,
  ClipboardDocumentIcon,
  PlusIcon,
  ChevronDownIcon,
  CalendarIcon,
  ClockIcon,
  TagIcon,
} from "@heroicons/react/24/solid";
import { HeartIcon as HeartOutlineIcon } from "@heroicons/react/24/outline";
import type { SunoSong } from "@/lib/sunoapi";
import { getRating, setRating, type SongRating } from "@/lib/ratings";
import { downloadSongFile } from "@/lib/download";
import { useToast } from "./Toast";
import { WaveformPlayer } from "./WaveformPlayer";
import { TagInput } from "./TagInput";

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

// ─── Star rating widget ────────────────────────────────────────────────────────

interface StarPickerProps {
  value: number;
  onChange: (stars: number) => void;
}

function StarPicker({ value, onChange }: StarPickerProps) {
  const [hovered, setHovered] = useState(0);

  return (
    <div className="flex gap-1" role="group" aria-label="Star rating">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          onClick={() => onChange(star)}
          onMouseEnter={() => setHovered(star)}
          onMouseLeave={() => setHovered(0)}
          aria-label={`${star} star${star !== 1 ? "s" : ""}`}
          className="text-2xl min-w-[44px] min-h-[44px] flex items-center justify-center transition-transform hover:scale-110"
        >
          <span
            className={
              star <= (hovered || value) ? "text-yellow-400" : "text-gray-300 dark:text-gray-600"
            }
          >
            ★
          </span>
        </button>
      ))}
    </div>
  );
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlaylistOption {
  id: string;
  name: string;
  _count: { songs: number };
}

interface SongTag {
  id: string;
  name: string;
  color: string;
}

interface SongDetailViewProps {
  song: SunoSong;
  isFavorite?: boolean;
  favoriteCount?: number;
  sunoJobId?: string | null;
  playlists?: PlaylistOption[];
  isPublic?: boolean;
  publicSlug?: string | null;
  songTags?: SongTag[];
}

// ─── Main SongDetailView ──────────────────────────────────────────────────────

export function SongDetailView({
  song,
  isFavorite: initialFavorite = false,
  favoriteCount: initialFavoriteCount = 0,
  sunoJobId,
  playlists: initialPlaylists = [],
  isPublic: initialIsPublic = false,
  publicSlug: initialPublicSlug = null,
  songTags: initialSongTags = [],
}: SongDetailViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [favoriteCount, setFavoriteCount] = useState(initialFavoriteCount);

  const [rating, setRatingState] = useState<SongRating>({ stars: 0, note: "" });
  const [saved, setSaved] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");

  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  // Playlist dropdown
  const [playlistOpen, setPlaylistOpen] = useState(false);
  const [addingToPlaylist, setAddingToPlaylist] = useState<string | null>(null);
  const playlistRef = useRef<HTMLDivElement>(null);

  // Share state
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [publicSlug, setPublicSlug] = useState(initialPublicSlug);
  const [sharing, setSharing] = useState(false);

  const hasAudio = Boolean(song.audioUrl);

  // Load existing rating
  useEffect(() => {
    const existing = getRating(song.id);
    if (existing) {
      setRatingState(existing);
      setNoteDraft(existing.note);
    }
  }, [song.id]);

  // Close playlist dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (playlistRef.current && !playlistRef.current.contains(e.target as Node)) {
        setPlaylistOpen(false);
      }
    }
    if (playlistOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [playlistOpen]);

  function handleStarChange(stars: number) {
    setRatingState((r) => ({ ...r, stars }));
    setSaved(false);
  }

  async function handleDownload() {
    if (!hasAudio || downloadProgress !== null) return;
    setDownloadError(null);
    try {
      await downloadSongFile(song, setDownloadProgress);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setDownloadError(msg);
      toast(msg, "error");
    } finally {
      setTimeout(() => setDownloadProgress(null), 1500);
    }
  }

  function handleSaveRating() {
    if (rating.stars === 0) return;
    const r: SongRating = { stars: rating.stars, note: noteDraft.trim() };
    setRating(song.id, r);
    setRatingState(r);
    setSaved(true);
  }

  async function handleToggleFavorite() {
    const prev = isFavorite;
    const prevCount = favoriteCount;
    const newFav = !prev;
    setIsFavorite(newFav);
    setFavoriteCount(newFav ? prevCount + 1 : Math.max(0, prevCount - 1));
    try {
      const res = await fetch(`/api/songs/${song.id}/favorite`, {
        method: newFav ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setIsFavorite(prev);
        setFavoriteCount(prevCount);
        toast("Failed to update favorite", "error");
      } else {
        const data = await res.json();
        setFavoriteCount(data.favoriteCount);
        toast(newFav ? "Added to favorites" : "Removed from favorites", "success");
      }
    } catch {
      setIsFavorite(prev);
      setFavoriteCount(prevCount);
      toast("Failed to update favorite", "error");
    }
  }

  async function handleAddToPlaylist(playlistId: string) {
    setAddingToPlaylist(playlistId);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: song.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error ?? "Failed to add to playlist", "error");
      } else {
        toast("Added to playlist", "success");
        setPlaylistOpen(false);
      }
    } catch {
      toast("Failed to add to playlist", "error");
    } finally {
      setAddingToPlaylist(null);
    }
  }

  async function handleShare() {
    setSharing(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/share`, { method: "PATCH" });
      if (!res.ok) {
        toast("Failed to update sharing", "error");
        return;
      }
      const data = await res.json();
      setIsPublic(data.isPublic);
      setPublicSlug(data.publicSlug);

      if (data.isPublic && data.publicSlug) {
        const url = `${window.location.origin}/s/${data.publicSlug}`;
        await navigator.clipboard.writeText(url);
        toast("Public link copied to clipboard", "success");
      } else {
        toast("Song is now private", "success");
      }
    } catch {
      toast("Failed to update sharing", "error");
    } finally {
      setSharing(false);
    }
  }

  async function handleCopyLink() {
    if (!publicSlug) return;
    const url = `${window.location.origin}/s/${publicSlug}`;
    await navigator.clipboard.writeText(url);
    toast("Link copied to clipboard", "success");
  }

  return (
    <div className="px-4 py-4 space-y-5 max-w-2xl mx-auto">
      {/* Back link */}
      <button
        onClick={() => router.back()}
        className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px]"
      >
        <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
        Back
      </button>

      {/* Cover art */}
      <div className="w-full aspect-square max-h-64 rounded-2xl bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
        {song.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={song.imageUrl}
            alt={song.title}
            className="w-full h-full object-cover"
          />
        ) : (
          <MusicalNoteIcon className="w-20 h-20 text-gray-400 dark:text-gray-600" aria-hidden="true" />
        )}
      </div>

      {/* Title + favorite */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex-1">{song.title}</h1>
          <button
            onClick={handleToggleFavorite}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={`flex-shrink-0 flex items-center gap-1 px-2 h-11 rounded-full transition-colors ${
              isFavorite ? "text-pink-500" : "text-gray-400 dark:text-gray-500 hover:text-pink-400"
            }`}
          >
            {isFavorite ? (
              <HeartIcon className="w-6 h-6" />
            ) : (
              <HeartOutlineIcon className="w-6 h-6" />
            )}
            {favoriteCount > 0 && (
              <span className="text-sm font-medium">{favoriteCount}</span>
            )}
          </button>
        </div>
      </div>

      {/* Full metadata grid */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {song.tags && (
            <div className="flex items-start gap-2">
              <TagIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block">Style</span>
                <span className="text-gray-900 dark:text-white">{song.tags}</span>
              </div>
            </div>
          )}
          {song.duration != null && (
            <div className="flex items-start gap-2">
              <ClockIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block">Duration</span>
                <span className="text-gray-900 dark:text-white">{formatTime(song.duration)}</span>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <CalendarIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs block">Created</span>
              <span className="text-gray-900 dark:text-white">{formatDate(song.createdAt)}</span>
            </div>
          </div>
          {song.model && (
            <div className="flex items-start gap-2">
              <MusicalNoteIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block">Model</span>
                <span className="text-gray-900 dark:text-white">{song.model}</span>
              </div>
            </div>
          )}
          {rating.stars > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-violet-400 mt-0.5 flex-shrink-0 text-sm">★</span>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block">Rating</span>
                <span className="text-yellow-400">{Array(rating.stars).fill("★").join("")}</span>
              </div>
            </div>
          )}
          {sunoJobId && (
            <div className="flex items-start gap-2 col-span-2">
              <span className="text-violet-400 mt-0.5 flex-shrink-0 text-xs font-mono">#</span>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block">Suno ID</span>
                <span className="text-gray-900 dark:text-white font-mono text-xs">{sunoJobId}</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Tags */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Tags</h2>
        <TagInput songId={song.id} initialTags={initialSongTags} />
      </div>

      {/* Waveform player */}
      {hasAudio ? (
        <WaveformPlayer audioUrl={song.audioUrl} duration={song.duration} />
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center text-sm text-gray-400 dark:text-gray-600">
          No audio available
        </div>
      )}

      {/* Action buttons row */}
      <div className="flex flex-wrap gap-2">
        {/* Download */}
        <button
          onClick={handleDownload}
          disabled={!hasAudio || downloadProgress !== null}
          aria-label="Download song"
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors min-h-[44px] ${
            hasAudio && downloadProgress === null
              ? "bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
              : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
          }`}
        >
          <ArrowDownTrayIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          {downloadProgress === null
            ? "Download"
            : downloadProgress === 100
            ? "Done"
            : `${downloadProgress}%`}
        </button>

        {/* Share button */}
        {isPublic ? (
          <>
            <button
              onClick={handleCopyLink}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors min-h-[44px]"
            >
              <ClipboardDocumentIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              Copy link
            </button>
            <button
              onClick={handleShare}
              disabled={sharing}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 text-red-600 dark:text-red-400 transition-colors min-h-[44px]"
            >
              <ShareIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              {sharing ? "Updating..." : "Make private"}
            </button>
          </>
        ) : (
          <button
            onClick={handleShare}
            disabled={sharing}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors min-h-[44px]"
          >
            <ShareIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            {sharing ? "Sharing..." : "Share"}
          </button>
        )}

        {/* Add to playlist dropdown */}
        <div className="relative" ref={playlistRef}>
          <button
            onClick={() => setPlaylistOpen(!playlistOpen)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors min-h-[44px]"
          >
            <PlusIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            Add to playlist
            <ChevronDownIcon className="w-3 h-3" aria-hidden="true" />
          </button>

          {playlistOpen && (
            <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-20 py-1 max-h-60 overflow-y-auto">
              {initialPlaylists.length === 0 ? (
                <div className="px-3 py-2 text-sm text-gray-400 dark:text-gray-500">
                  No playlists yet.{" "}
                  <Link href="/playlists" className="text-violet-400 hover:text-violet-300">
                    Create one
                  </Link>
                </div>
              ) : (
                initialPlaylists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => handleAddToPlaylist(pl.id)}
                    disabled={addingToPlaylist === pl.id}
                    className="w-full text-left px-3 py-2 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 flex items-center justify-between"
                  >
                    <span className="truncate">{pl.name}</span>
                    <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2">
                      {pl._count.songs} songs
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      {/* Download progress/error */}
      {downloadProgress !== null && downloadProgress < 100 && (
        <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
          <div
            className="h-full bg-violet-500 rounded-full transition-all duration-300"
            style={{ width: `${downloadProgress}%` }}
          />
        </div>
      )}
      {downloadError && <p className="text-xs text-red-400">{downloadError}</p>}

      {/* Create variation */}
      <Link
        href={`/generate?${new URLSearchParams({
          ...(song.prompt ? { prompt: song.prompt } : {}),
          ...(song.tags ? { tags: song.tags } : {}),
        }).toString()}`}
        className="flex items-center justify-center gap-2 w-full px-4 py-3 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
      >
        <ArrowPathIcon className="w-4 h-4" aria-hidden="true" />
        Create variation
      </Link>

      {/* Lyrics */}
      {song.lyrics && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Lyrics</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 whitespace-pre-line leading-relaxed">
            {song.lyrics}
          </p>
        </div>
      )}

      {/* Prompt */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Prompt</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{song.prompt}</p>
      </div>

      {/* Rating */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Your Rating</h2>

        <StarPicker value={rating.stars} onChange={handleStarChange} />

        <textarea
          value={noteDraft}
          onChange={(e) => {
            setNoteDraft(e.target.value);
            setSaved(false);
          }}
          placeholder="Add a note (optional)..."
          aria-label="Rating note"
          rows={3}
          className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-base text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
        />

        <div className="flex items-center gap-3">
          <button
            onClick={handleSaveRating}
            disabled={rating.stars === 0}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 disabled:bg-gray-200 dark:disabled:bg-gray-800 disabled:text-gray-400 dark:disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-colors min-h-[44px]"
          >
            Save rating
          </button>
          {saved && (
            <span className="text-sm text-green-400">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
