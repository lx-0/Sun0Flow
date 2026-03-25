"use client";

import { useEffect, useLayoutEffect, useRef, useState, useCallback, useMemo } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  MusicalNoteIcon,
  ArrowDownTrayIcon,
  ShareIcon,
  HeartIcon,
  ArrowUpOnSquareStackIcon,
  MagnifyingGlassIcon,
  XMarkIcon,
  FunnelIcon,
  TrashIcon,
  CheckIcon,
  TagIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  CloudArrowDownIcon,
  ForwardIcon,
} from "@heroicons/react/24/solid";
import {
  HeartIcon as HeartOutlineIcon,
  QueueListIcon,
  Squares2X2Icon,
  ListBulletIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon as PlayOutlineIcon } from "@heroicons/react/24/outline";
import Image from "next/image";
import type { Song } from "@prisma/client";
import type { SongRating } from "@/lib/ratings";
import { downloadSongFile } from "@/lib/download";
import { exportAsZip, exportAsM3U, type ExportableSong } from "@/lib/export";
import dynamic from "next/dynamic";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";
import { TagChip } from "./TagInput";
// Lazy-load the import modal — only rendered when user opens it
const SunoImportModal = dynamic(() => import("./SunoImportModal").then((m) => m.SunoImportModal), { ssr: false });

// ─── Types ───────────────────────────────────────────────────────────────────

interface SongTagRelation {
  tag: { id: string; name: string; color: string };
}

type SongWithTags = Song & { songTags: SongTagRelation[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Highlight matching search terms in text with bold spans. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 3) return <>{text}</>;
  // Strip quotes and split into tokens, ignoring short fragments
  const tokens = query
    .replace(/["']/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
  if (tokens.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${tokens.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  const parts = text.split(pattern);
  return (
    <>
      {parts.map((part, i) =>
        pattern.test(part) ? (
          <mark key={i} className="bg-yellow-200 dark:bg-yellow-800/60 text-inherit rounded-sm px-0.5">
            {part}
          </mark>
        ) : (
          part
        )
      )}
    </>
  );
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function StarDisplay({ stars }: { stars: number }) {
  return (
    <span className="text-yellow-400 text-xs" role="img" aria-label={`${stars} out of 5 stars`}>
      {"★".repeat(stars)}
      {"☆".repeat(5 - stars)}
    </span>
  );
}

// ─── Inline audio player bar ──────────────────────────────────────────────────

interface PlayerBarProps {
  currentTime: number;
  duration: number;
  hasAudio: boolean;
  onSeek: (pct: number) => void;
}

function PlayerBar({ currentTime, duration, hasAudio, onSeek }: PlayerBarProps) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="mt-2 space-y-1">
      <div className="relative h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full">
        <div
          className="absolute inset-y-0 left-0 bg-violet-500 rounded-full transition-all"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          disabled={!hasAudio}
          onChange={(e) => onSeek(Number(e.target.value) / 100)}
          className="absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full opacity-0 cursor-pointer disabled:cursor-default min-h-[44px]"
          aria-label="Seek"
        />
      </div>
      <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
        <span>{formatTime(currentTime)}</span>
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  );
}

// ─── Status badges ────────────────────────────────────────────────────────────

function GeneratingBadge() {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/50 border border-violet-300 dark:border-violet-700 text-violet-700 dark:text-violet-300 text-xs font-medium">
      <svg
        className="animate-spin h-3 w-3"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
      Generating…
    </span>
  );
}

function FailedBadge({ message }: { message?: string | null }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/50 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-300 text-xs font-medium"
      title={message ?? "Generation failed"}
    >
      Failed
    </span>
  );
}

// ─── Polling hook ─────────────────────────────────────────────────────────────

const POLL_INTERVAL_MS = 4000;
const MAX_POLL_ATTEMPTS = 20;

function usePollSong(song: Song, onUpdate: (updated: Song) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);
  const attemptsRef = useRef(song.pollCount);

  useEffect(() => {
    activeRef.current = true;
    attemptsRef.current = song.pollCount;

    if (song.generationStatus !== "pending") return;

    async function poll() {
      if (!activeRef.current) return;
      try {
        const res = await fetch(`/api/songs/${song.id}/status`);
        if (!res.ok) return;
        const data = (await res.json()) as { song: Song };
        if (!activeRef.current) return;
        onUpdate(data.song);
        if (data.song.generationStatus === "pending" && attemptsRef.current < MAX_POLL_ATTEMPTS) {
          attemptsRef.current++;
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        if (activeRef.current) {
          timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        }
      }
    }

    timerRef.current = setTimeout(poll, POLL_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);
}

// ─── Add to playlist picker ───────────────────────────────────────────────────

interface PlaylistOption {
  id: string;
  name: string;
  _count: { songs: number };
}

function AddToPlaylistButton({ songId }: { songId: string }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<PlaylistOption[]>([]);
  const [loading, setLoading] = useState(false);
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
    setOpen(true);
    setLoading(true);
    try {
      const res = await fetch("/api/playlists");
      if (res.ok) {
        const data = await res.json();
        setPlaylists(data.playlists);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(playlistId: string) {
    setOpen(false);
    try {
      const res = await fetch(`/api/playlists/${playlistId}/songs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to add to playlist", "error");
        return;
      }
      toast("Added to playlist", "success");
    } catch {
      toast("Failed to add to playlist", "error");
    }
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={handleOpen}
        aria-label="Add to playlist"
        className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-violet-400 transition-colors"
      >
        <QueueListIcon className="w-5 h-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
          {loading ? (
            <p className="px-4 py-3 text-sm text-gray-500">Loading…</p>
          ) : playlists.length === 0 ? (
            <p className="px-4 py-3 text-sm text-gray-500">No playlists yet</p>
          ) : (
            playlists.map((pl) => (
              <button
                key={pl.id}
                onClick={() => handleAdd(pl.id)}
                className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b last:border-b-0 border-gray-200 dark:border-gray-800"
              >
                {pl.name}
                <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                  ({pl._count.songs})
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function songToQueueSong(song: Song): QueueSong | null {
  if (!song.audioUrl) return null;
  return {
    id: song.id,
    title: song.title,
    audioUrl: song.audioUrl,
    imageUrl: song.imageUrl,
    duration: song.duration,
    lyrics: song.lyrics,
  };
}

// ─── Per-song action menu (three-dot/kebab) ───────────────────────────────────

interface SongRowMenuProps {
  song: Song;
  isArchiveView: boolean;
  hasAudio: boolean;
  onToggleFavorite: (song: Song) => void;
  onShare: () => void;
  onDownload: (song: Song) => void;
  onSingleArchive: (song: Song) => void;
  onSingleRestore: (song: Song) => void;
  onSingleDeleteForever: (song: Song) => void;
}

function SongRowMenu({
  song,
  isArchiveView,
  hasAudio,
  onToggleFavorite,
  onShare,
  onDownload,
  onSingleArchive,
  onSingleRestore,
  onSingleDeleteForever,
}: SongRowMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { playNext, addToQueue } = useQueue();
  const { toast } = useToast();
  const router = useRouter();

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

  const itemClass =
    "w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b border-gray-200 dark:border-gray-800 flex items-center gap-2";

  return (
    <div className="relative ml-auto" ref={menuRef}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        aria-label="More actions"
        className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100"
      >
        <EllipsisVerticalIcon className="w-5 h-5" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute right-0 bottom-full mb-1 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-30 overflow-hidden">
          <button
            onClick={() => { setOpen(false); onToggleFavorite(song); }}
            className={itemClass}
          >
            {song.isFavorite
              ? <HeartIcon className="w-4 h-4 text-pink-500 flex-shrink-0" />
              : <HeartOutlineIcon className="w-4 h-4 flex-shrink-0" />}
            {song.isFavorite ? "Unfavorite" : "Favorite"}
          </button>
          {hasAudio && (
            <button
              onClick={() => {
                setOpen(false);
                const qs: QueueSong = { id: song.id, title: song.title, audioUrl: song.audioUrl!, imageUrl: song.imageUrl, duration: song.duration, lyrics: song.lyrics };
                playNext(qs);
                toast("Playing next", "success");
              }}
              className={itemClass}
            >
              <ForwardIcon className="w-4 h-4 flex-shrink-0" />
              Play Next
            </button>
          )}
          {hasAudio && (
            <button
              onClick={() => {
                setOpen(false);
                const qs: QueueSong = { id: song.id, title: song.title, audioUrl: song.audioUrl!, imageUrl: song.imageUrl, duration: song.duration, lyrics: song.lyrics };
                addToQueue(qs);
                toast("Added to queue", "success");
              }}
              className={itemClass}
            >
              <QueueListIcon className="w-4 h-4 flex-shrink-0" />
              Add to Queue
            </button>
          )}
          {hasAudio && (
            <button
              onClick={() => { setOpen(false); onShare(); }}
              className={itemClass}
            >
              <ShareIcon className="w-4 h-4 flex-shrink-0" />
              Share
            </button>
          )}
          {hasAudio && (
            <button
              onClick={() => { setOpen(false); onDownload(song); }}
              className={itemClass}
            >
              <ArrowDownTrayIcon className="w-4 h-4 flex-shrink-0" />
              Download
            </button>
          )}
          {!isArchiveView && (
            <button
              onClick={() => { setOpen(false); router.push(`/library/${song.id}`); }}
              className={itemClass}
            >
              <ArrowPathIcon className="w-4 h-4 flex-shrink-0" />
              Create Variation
            </button>
          )}
          {isArchiveView ? (
            <>
              <button
                onClick={() => { setOpen(false); onSingleRestore(song); }}
                className={itemClass}
              >
                <ArrowUturnLeftIcon className="w-4 h-4 text-green-500 flex-shrink-0" />
                Restore
              </button>
              <button
                onClick={() => { setOpen(false); onSingleDeleteForever(song); }}
                className="w-full text-left px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors flex items-center gap-2"
              >
                <TrashIcon className="w-4 h-4 flex-shrink-0" />
                Delete forever
              </button>
            </>
          ) : (
            <button
              onClick={() => { setOpen(false); onSingleArchive(song); }}
              className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors flex items-center gap-2"
            >
              <ArchiveBoxIcon className="w-4 h-4 flex-shrink-0" />
              Archive
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Song row (handles its own polling) ───────────────────────────────────────

interface SongRowProps {
  initialSong: Song;
  isActive: boolean;
  isPlaying: boolean;
  currentTime: number;
  audioDuration: number;
  rating: SongRating | undefined;
  downloadProgress: number | null;
  downloadError: string | null;
  isSelected: boolean;
  selectionMode: boolean;
  searchQuery?: string;
  onTogglePlay: (song: Song) => void;
  onDownload: (song: Song) => void;
  onSeek: (pct: number) => void;
  onUpdate: (updated: Song) => void;
  onToggleFavorite: (song: Song) => void;
  onToggleSelect: (songId: string, shiftKey: boolean) => void;
  onRetry: (song: Song) => void;
  retryingId: string | null;
  isArchiveView: boolean;
  onSingleArchive: (song: Song) => void;
  onSingleRestore: (song: Song) => void;
  onSingleDeleteForever: (song: Song) => void;
}

function SongRow({
  initialSong,
  isActive,
  isPlaying,
  currentTime,
  audioDuration,
  rating,
  downloadProgress,
  downloadError,
  isSelected,
  selectionMode,
  searchQuery = "",
  onTogglePlay,
  onDownload,
  onSeek,
  onUpdate,
  onToggleFavorite,
  onToggleSelect,
  onRetry,
  retryingId,
  isArchiveView,
  onSingleArchive,
  onSingleRestore,
  onSingleDeleteForever,
}: SongRowProps) {
  const { toast } = useToast();
  const [song, setSong] = useState(initialSong);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);

  useEffect(() => { setSong(initialSong); }, [initialSong]);

  const handleUpdate = useCallback((updated: Song) => {
    if (song.generationStatus === "pending" && updated.generationStatus !== "pending") {
      if (updated.generationStatus === "ready") {
        const vc = (updated as Song & { variationCount?: number }).variationCount ?? 0;
        const msg = vc > 0
          ? `${vc + 1} versions ready — click to compare`
          : `"${updated.title ?? "Song"}" is ready!`;
        toast(msg, "success");
      } else if (updated.generationStatus === "failed") {
        toast(`"${updated.title ?? "Song"}" generation failed`, "error");
      }
    }
    setSong(updated);
    onUpdate(updated);
  }, [onUpdate, song.generationStatus, toast]);

  usePollSong(song, handleUpdate);

  const isPending = song.generationStatus === "pending";
  const isFailed = song.generationStatus === "failed";
  const isRetrying = retryingId === song.id;
  const hasAudio = Boolean(song.audioUrl) && !isPending;
  const isDownloading = downloadProgress !== null;

  // Build accessible label for song card
  const songTitle = song.title ?? "Untitled";
  const statusText = isPending ? ", generating" : isFailed ? ", failed" : "";
  const ratingText = rating ? `, ${rating.stars} of 5 stars` : "";
  const songAriaLabel = `${songTitle}${statusText}${ratingText}`;

  async function handleShare() {
    setShareLoading(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/share`, { method: "PATCH" });
      if (!res.ok) return;
      const data = await res.json();
      const updated = { ...song, isPublic: data.isPublic, publicSlug: data.publicSlug };
      setSong(updated);
      onUpdate(updated);
      if (data.isPublic && data.publicSlug) {
        const url = `${window.location.origin}/s/${data.publicSlug}`;
        await navigator.clipboard.writeText(url);
        setShareCopied(true);
        setTimeout(() => setShareCopied(false), 2000);
        toast("Share link copied to clipboard!", "success");
      } else if (!data.isPublic) {
        toast("Song is now private", "info");
      }
    } finally {
      setShareLoading(false);
    }
  }

  return (
    <div
      role="option"
      tabIndex={0}
      aria-selected={isActive}
      aria-label={songAriaLabel}
      className={`group bg-white dark:bg-gray-900 border rounded-xl overflow-hidden transition-colors ${
        isSelected
          ? "border-violet-500 bg-violet-50 dark:bg-violet-950/30"
          : isActive
            ? "border-violet-600"
            : "border-gray-200 dark:border-gray-800"
      } ${isPending ? "opacity-75" : ""}`}
    >
      <div className="flex items-center gap-3 px-3 pt-3 pb-1">
        {/* Selection checkbox */}
        <button
          onClick={(e) => onToggleSelect(song.id, e.shiftKey)}
          aria-label={isSelected ? "Deselect song" : "Select song"}
          className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
            selectionMode ? "opacity-100" : "opacity-0 group-hover:opacity-100 sm:opacity-0 sm:hover:opacity-100"
          } ${
            isSelected
              ? "bg-violet-600 border-violet-600 text-white"
              : "border-gray-300 dark:border-gray-600 hover:border-violet-400"
          }`}
        >
          {isSelected && <CheckIcon className="w-4 h-4" />}
        </button>

        <div className="relative flex-shrink-0 w-12 h-12 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
          {song.imageUrl ? (
            <Image src={song.imageUrl} alt={song.title ?? "Song"} fill className="object-cover" sizes="48px" loading="lazy" placeholder="blur" blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHZpZXdCb3g9IjAgMCAxMCAxMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiM3YzNhZWQiIGZpbGwtb3BhY2l0eT0iMC4yIi8+PC9zdmc+" />
          ) : (
            <MusicalNoteIcon className="w-6 h-6 text-gray-400 dark:text-gray-600" aria-hidden="true" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <Link
            href={`/library/${song.id}`}
            className="block text-sm font-medium text-gray-900 dark:text-white truncate hover:text-violet-400 transition-colors"
          >
            <Highlight text={song.title ?? "Untitled"} query={searchQuery} />
          </Link>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {isPending && <GeneratingBadge />}
            {isFailed && <FailedBadge message={song.errorMessage} />}
            {!isPending && !isFailed && (song as SongWithTags).songTags?.length > 0 && (
              <div className="flex gap-1 flex-wrap">
                {(song as SongWithTags).songTags.slice(0, 3).map((st) => (
                  <TagChip key={st.tag.id} tag={st.tag} size="xs" />
                ))}
                {(song as SongWithTags).songTags.length > 3 && (
                  <span className="text-[10px] text-gray-500 dark:text-gray-400">+{(song as SongWithTags).songTags.length - 3}</span>
                )}
              </div>
            )}
            {!isPending && !isFailed && !((song as SongWithTags).songTags?.length > 0) && song.tags && (
              <span className="text-xs text-gray-500 truncate">
                {song.tags.split(",")[0].trim()}
              </span>
            )}
            {!isPending && song.duration && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex-shrink-0">
                {formatTime(song.duration)}
              </span>
            )}
            {!isPending && !isFailed && ((song as Song & { variationCount?: number }).variationCount ?? 0) > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-[10px] font-medium">
                {((song as Song & { variationCount?: number }).variationCount ?? 0) + 1} versions
              </span>
            )}
          </div>
          {rating && (
            <div className="mt-0.5">
              <StarDisplay stars={rating.stars} />
            </div>
          )}
        </div>

        <button
          onClick={() => onTogglePlay(song)}
          disabled={!hasAudio}
          aria-label={isActive && isPlaying ? "Pause" : "Play"}
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            hasAudio
              ? "bg-violet-600 hover:bg-violet-500 text-white"
              : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
          }`}
        >
          {isActive && isPlaying ? (
            <PauseIcon className="w-5 h-5" />
          ) : (
            <PlayIcon className="w-5 h-5 ml-0.5" />
          )}
        </button>
      </div>

      <div className="flex items-center gap-2 px-3 pb-2">
        {isFailed && (
          <button
            onClick={() => onRetry(song)}
            disabled={isRetrying}
            className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center bg-red-100 dark:bg-red-900/40 hover:bg-red-200 dark:hover:bg-red-900/60 text-red-600 dark:text-red-400 transition-colors disabled:opacity-50"
            title="Retry with same parameters"
            aria-label="Retry"
          >
            {isRetrying ? (
              <svg
                className="animate-spin h-5 w-5"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <ArrowPathIcon className="w-5 h-5" />
            )}
          </button>
        )}

        <button
          onClick={() => onToggleFavorite(song)}
          aria-label={song.isFavorite ? "Remove from favorites" : "Add to favorites"}
          className={`flex-shrink-0 h-11 px-2 rounded-full flex items-center gap-1 transition-colors ${
            song.isFavorite
              ? "text-pink-500 hover:text-pink-400"
              : "text-gray-400 dark:text-gray-500 hover:text-pink-400"
          }`}
        >
          {song.isFavorite ? (
            <HeartIcon className="w-5 h-5" />
          ) : (
            <HeartOutlineIcon className="w-5 h-5" />
          )}
          {((song as Song & { favoriteCount?: number }).favoriteCount ?? 0) > 0 && (
            <span className="text-xs font-medium">
              {(song as Song & { favoriteCount?: number }).favoriteCount}
            </span>
          )}
        </button>

        <button
          onClick={handleShare}
          disabled={!hasAudio || shareLoading}
          aria-label={shareCopied ? "Link copied!" : song.isPublic ? "Make private" : "Share"}
          title={shareCopied ? "Link copied!" : song.isPublic ? "Make private" : "Share song"}
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            shareCopied
              ? "bg-green-700 text-white"
              : song.isPublic
                ? "bg-violet-100 dark:bg-violet-800 hover:bg-violet-200 dark:hover:bg-violet-700 text-violet-700 dark:text-violet-300"
                : hasAudio
                  ? "bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
                  : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
          }`}
        >
          <ShareIcon className="w-5 h-5" aria-hidden="true" />
        </button>

        <button
          onClick={() => onDownload(song)}
          disabled={!hasAudio || isDownloading}
          aria-label={isDownloading ? `Downloading ${downloadProgress}%` : "Download song"}
          className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
            hasAudio && !isDownloading
              ? "bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
              : "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-600 cursor-not-allowed"
          }`}
        >
          <ArrowDownTrayIcon className="w-5 h-5" aria-hidden="true" />
        </button>

        <AddToPlaylistButton songId={song.id} />

        <SongRowMenu
          song={song}
          isArchiveView={isArchiveView}
          hasAudio={hasAudio}
          onToggleFavorite={onToggleFavorite}
          onShare={handleShare}
          onDownload={onDownload}
          onSingleArchive={onSingleArchive}
          onSingleRestore={onSingleRestore}
          onSingleDeleteForever={onSingleDeleteForever}
        />
      </div>

      {isActive && (
        <div className="px-3 pb-3">
          <PlayerBar
            currentTime={currentTime}
            duration={audioDuration}
            hasAudio={hasAudio}
            onSeek={onSeek}
          />
        </div>
      )}

      {isDownloading && downloadProgress !== null && downloadProgress < 100 && (
        <div className="px-3 pb-2">
          <div className="h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${downloadProgress}%` }}
            />
          </div>
        </div>
      )}

      {downloadError && (
        <div className="px-3 pb-2">
          <p className="text-xs text-red-400">{downloadError}</p>
        </div>
      )}
    </div>
  );
}

// ─── Sort / filter constants ─────────────────────────────────────────────────

const SORT_OPTIONS = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Highest rated", value: "highest_rated" },
  { label: "Most played", value: "most_played" },
  { label: "Recently modified", value: "recently_modified" },
  { label: "Title A–Z", value: "title_az" },
] as const;

const SMART_FILTER_OPTIONS = [
  { label: "This week", value: "this_week" },
  { label: "Unrated", value: "unrated" },
  { label: "Most played", value: "most_played" },
  { label: "Favorites", value: "favorites" },
  { label: "Archive", value: "archived" },
] as const;

const STATUS_OPTIONS = [
  { label: "All statuses", value: "" },
  { label: "Ready", value: "ready" },
  { label: "Pending", value: "pending" },
  { label: "Failed", value: "failed" },
] as const;

const RATING_OPTIONS = [
  { label: "Any rating", value: "" },
  { label: "1★+", value: "1" },
  { label: "2★+", value: "2" },
  { label: "3★+", value: "3" },
  { label: "4★+", value: "4" },
  { label: "5★", value: "5" },
] as const;

// ─── useDebounce ─────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

// ─── Main LibraryView ─────────────────────────────────────────────────────────

function toDownloadable(song: Song) {
  return {
    id: song.id,
    title: song.title ?? "Untitled",
    audioUrl: song.audioUrl ?? "",
    tags: song.tags ?? undefined,
  };
}

// ─── Compact grid card for grid view ──────────────────────────────────────────

interface SongGridCardProps {
  song: Song;
  isActive: boolean;
  isPlaying: boolean;
  searchQuery?: string;
  onTogglePlay: (song: Song) => void;
  onToggleFavorite: (song: Song) => void;
}

function SongGridCard({ song, isActive, isPlaying, searchQuery = "", onTogglePlay, onToggleFavorite }: SongGridCardProps) {
  return (
    <li className="group relative bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden hover:border-violet-300 dark:hover:border-violet-700 transition-colors">
      {/* Cover image */}
      <div className="relative aspect-square bg-gray-100 dark:bg-gray-800">
        {song.imageUrl ? (
          <Image
            src={song.imageUrl}
            alt={song.title ?? "Song cover"}
            fill
            className="object-cover"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            loading="lazy"
            placeholder="blur"
            blurDataURL="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIHZpZXdCb3g9IjAgMCAxMCAxMCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAiIGhlaWdodD0iMTAiIGZpbGw9IiM3YzNhZWQiIGZpbGwtb3BhY2l0eT0iMC4yIi8+PC9zdmc+"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700" aria-hidden="true" />
          </div>
        )}

        {/* Play button overlay */}
        <button
          onClick={() => onTogglePlay(song)}
          aria-label={isActive && isPlaying ? "Pause" : "Play"}
          className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors"
        >
          <span className={`flex items-center justify-center w-12 h-12 rounded-full bg-white/90 shadow-lg transition-opacity ${isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {isActive && isPlaying ? (
              <PauseIcon className="w-6 h-6 text-violet-600" />
            ) : (
              <PlayIcon className="w-6 h-6 text-violet-600 ml-0.5" />
            )}
          </span>
        </button>

        {/* Playing indicator bars */}
        {isActive && isPlaying && (
          <div className="absolute bottom-2 left-2 flex items-end gap-0.5" aria-hidden="true">
            {[1, 2, 3].map((i) => (
              <span key={i} className="w-1 bg-violet-400 rounded-full animate-pulse" style={{ height: `${8 + i * 4}px`, animationDelay: `${i * 0.1}s` }} />
            ))}
          </div>
        )}
      </div>

      {/* Info row */}
      <div className="px-3 py-2 flex items-center justify-between gap-2">
        <Link href={`/library/${song.id}`} className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors min-w-0">
          <Highlight text={song.title ?? "Untitled"} query={searchQuery} />
        </Link>
        <button
          onClick={() => onToggleFavorite(song)}
          aria-label={(song as Song & { isFavorite?: boolean }).isFavorite ? "Remove from favorites" : "Add to favorites"}
          className="flex-shrink-0 text-gray-400 hover:text-red-500 transition-colors"
        >
          {(song as Song & { isFavorite?: boolean }).isFavorite ? (
            <HeartIcon className="w-4 h-4 text-red-500" />
          ) : (
            <HeartOutlineIcon className="w-4 h-4" />
          )}
        </button>
      </div>
    </li>
  );
}

interface LibraryViewProps {
  initialSongs: Song[];
  title?: string;
  enableServerSearch?: boolean;
}

export function LibraryView({
  initialSongs,
  title = "Library",
  enableServerSearch = true,
}: LibraryViewProps) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const {
    queue,
    currentIndex,
    isPlaying,
    currentTime,
    duration: audioDuration,
    togglePlay,
    playQueue,
    seek,
  } = useQueue();

  const currentSongId = currentIndex >= 0 ? queue[currentIndex]?.id ?? null : null;

  // ─── Filter state (initialized from URL params) ───────────────────────────
  const [searchText, setSearchText] = useState(searchParams.get("q") ?? "");
  const [statusFilter, setStatusFilter] = useState(searchParams.get("status") ?? "");
  const [ratingFilter, setRatingFilter] = useState(searchParams.get("minRating") ?? "");
  const [dateFrom, setDateFrom] = useState(searchParams.get("dateFrom") ?? "");
  const [dateTo, setDateTo] = useState(searchParams.get("dateTo") ?? "");
  const [sortBy, setSortBy] = useState(searchParams.get("sortBy") ?? "newest");
  const [tagFilter, setTagFilter] = useState(searchParams.get("tagId") ?? "");
  const [smartFilter, setSmartFilter] = useState(searchParams.get("smartFilter") ?? "");
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<"list" | "grid">(() => {
    if (typeof window === "undefined") return "list";
    return (localStorage.getItem("library-view-mode") as "list" | "grid") ?? "list";
  });
  const [availableTags, setAvailableTags] = useState<{ id: string; name: string; color: string }[]>([]);

  const debouncedSearch = useDebounce(searchText, 300);

  // ─── Song + playback state ────────────────────────────────────────────────
  const [songs, setSongs] = useState<Song[]>(initialSongs);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalSongs, setTotalSongs] = useState<number>(initialSongs.length);
  const [downloadProgress, setDownloadProgress] = useState<Record<string, number>>({});
  const [downloadErrors, setDownloadErrors] = useState<Record<string, string>>({});
  const [retryingId, setRetryingId] = useState<string | null>(null);

  // Selection state
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const [lastSelectedIndex, setLastSelectedIndex] = useState<number | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);

  // Per-song menu action state
  const [pendingMenuDelete, setPendingMenuDelete] = useState<{ song: Song } | null>(null);
  const [menuDeleteLoading, setMenuDeleteLoading] = useState(false);

  const selectionMode = selectedSongIds.size > 0;
  const isArchiveView = smartFilter === "archived";

  // Export state
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState<{ completed: number; total: number } | null>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Suno import modal state
  const [sunoImportOpen, setSunoImportOpen] = useState(false);

  // Arrow-key navigation for song list
  const songListRef = useRef<HTMLDivElement>(null);
  const handleSongListKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const list = songListRef.current;
      if (!list) return;
      const items = Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
      if (items.length === 0) return;
      const currentIdx = items.findIndex((el) => el.contains(document.activeElement) || el === document.activeElement);

      if (e.key === "ArrowDown") {
        e.preventDefault();
        const next = currentIdx < items.length - 1 ? currentIdx + 1 : 0;
        items[next].focus();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        const prev = currentIdx > 0 ? currentIdx - 1 : items.length - 1;
        items[prev].focus();
      } else if (e.key === "Enter" && currentIdx >= 0) {
        // Play the focused song
        const song = songs[currentIdx];
        if (song) {
          e.preventDefault();
          handleTogglePlay(song);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [songs]
  );

  // Close export menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (exportMenuRef.current && !exportMenuRef.current.contains(e.target as Node)) {
        setExportMenuOpen(false);
      }
    }
    if (exportMenuOpen) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [exportMenuOpen]);

  // ─── Fetch user tags for filter ───────────────────────────────────────────
  useEffect(() => {
    fetch("/api/tags")
      .then((r) => r.json())
      .then((data) => { if (data.tags) setAvailableTags(data.tags); })
      .catch(() => {});
  }, []);

  // ─── Sync filters → URL params ───────────────────────────────────────────
  const hasAnyFilter = !!(debouncedSearch || statusFilter || ratingFilter || dateFrom || dateTo || tagFilter || smartFilter || sortBy !== "newest");

  useEffect(() => {
    if (!enableServerSearch) return;

    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (ratingFilter) params.set("minRating", ratingFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortBy && sortBy !== "newest") params.set("sortBy", sortBy);
    if (tagFilter) params.set("tagId", tagFilter);
    if (smartFilter) params.set("smartFilter", smartFilter);

    const qs = params.toString();
    const newUrl = qs ? `${pathname}?${qs}` : pathname;
    router.replace(newUrl, { scroll: false });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, ratingFilter, dateFrom, dateTo, sortBy, tagFilter, smartFilter, enableServerSearch]);

  // ─── Build filter query string (shared by initial fetch and load-more) ───
  function buildFilterParams(): URLSearchParams {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("q", debouncedSearch);
    if (statusFilter) params.set("status", statusFilter);
    if (ratingFilter) params.set("minRating", ratingFilter);
    if (dateFrom) params.set("dateFrom", dateFrom);
    if (dateTo) params.set("dateTo", dateTo);
    if (sortBy) params.set("sortBy", sortBy);
    if (tagFilter) params.set("tagId", tagFilter);
    if (smartFilter === "archived") {
      params.set("archived", "true");
    } else if (smartFilter) {
      params.set("smartFilter", smartFilter);
    }
    return params;
  }

  // ─── Fetch songs from API when filters change ────────────────────────────
  useEffect(() => {
    if (!enableServerSearch) return;

    const params = buildFilterParams();

    let cancelled = false;
    setLoading(true);
    setNextCursor(null);

    fetch(`/api/songs?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.songs) {
          setSongs(data.songs);
          setNextCursor(data.nextCursor ?? null);
          setTotalSongs(data.total ?? data.songs.length);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, statusFilter, ratingFilter, dateFrom, dateTo, sortBy, tagFilter, smartFilter, enableServerSearch]);

  // ─── Load more (next page) ──────────────────────────────────────────────
  const handleLoadMore = useCallback(() => {
    if (!nextCursor || loadingMore) return;

    const params = buildFilterParams();
    params.set("cursor", nextCursor);

    setLoadingMore(true);

    fetch(`/api/songs?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.songs) {
          setSongs((prev) => [...prev, ...data.songs]);
          setNextCursor(data.nextCursor ?? null);
          setTotalSongs(data.total ?? totalSongs);
        }
      })
      .catch(() => {})
      .finally(() => setLoadingMore(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextCursor, loadingMore, debouncedSearch, statusFilter, ratingFilter, dateFrom, dateTo, sortBy, tagFilter, smartFilter]);

  // ─── Clear all filters ────────────────────────────────────────────────────
  function clearAllFilters() {
    setSearchText("");
    setStatusFilter("");
    setRatingFilter("");
    setDateFrom("");
    setDateTo("");
    setSortBy("newest");
    setTagFilter("");
    setSmartFilter("");
  }

  // ─── Song callbacks ───────────────────────────────────────────────────────
  const handleSongUpdate = useCallback((updated: Song) => {
    setSongs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
  }, []);

  async function handleTogglePlay(song: Song) {
    // If the song is already active, just toggle without re-loading
    if (currentSongId === song.id) {
      const qs = songToQueueSong(song);
      if (qs) togglePlay(qs);
      return;
    }

    // Check if the audio URL might be expired (within 3 days of expiry or no expiry set)
    const REFRESH_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;
    const rawExpiresAt = (song as Song & { audioUrlExpiresAt?: Date | string | null }).audioUrlExpiresAt;
    const expiresAtMs = rawExpiresAt ? new Date(rawExpiresAt).getTime() : null;
    const isNearExpiry =
      song.audioUrl &&
      (!expiresAtMs || isNaN(expiresAtMs) || expiresAtMs - Date.now() < REFRESH_THRESHOLD_MS);

    let playSong = song;
    if (isNearExpiry) {
      try {
        const res = await fetch(`/api/songs/${song.id}/refresh`, { method: "POST" });
        if (res.ok) {
          const data = await res.json();
          if (data.song?.audioUrl) {
            playSong = { ...song, audioUrl: data.song.audioUrl };
            handleSongUpdate(playSong);
          }
        } else if (res.status === 404) {
          const data = await res.json().catch(() => ({}));
          if (data.code === "SONG_DELETED") {
            toast("This song no longer exists on Suno and cannot be played.", "error");
            return;
          }
        }
      } catch {
        // Transient error — try playing with whatever URL we have
      }
    }

    const qs = songToQueueSong(playSong);
    if (!qs) return;

    // Build a queue from all playable songs and start at this one
    const allQueueSongs = songs
      .map(songToQueueSong)
      .filter((s): s is QueueSong => s !== null);
    const idx = allQueueSongs.findIndex((s) => s.id === song.id);
    playQueue(allQueueSongs, idx >= 0 ? idx : 0);
  }

  async function handleDownload(song: Song) {
    if (!song.audioUrl || song.id in downloadProgress) return;
    setDownloadErrors((e) => { const n = { ...e }; delete n[song.id]; return n; });
    setDownloadProgress((p) => ({ ...p, [song.id]: 0 }));
    try {
      await downloadSongFile(toDownloadable(song), (pct) =>
        setDownloadProgress((p) => ({ ...p, [song.id]: pct }))
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Download failed";
      setDownloadErrors((e) => ({ ...e, [song.id]: msg }));
      toast(msg, "error");
    } finally {
      setTimeout(
        () => setDownloadProgress((p) => { const n = { ...p }; delete n[song.id]; return n; }),
        1500
      );
    }
  }

  function handleSeek(pct: number) {
    seek(pct);
  }

  async function handleToggleFavorite(song: Song) {
    const newFav = !song.isFavorite;
    const prevCount = (song as Song & { favoriteCount?: number }).favoriteCount ?? 0;
    const optimistic = { ...song, isFavorite: newFav, favoriteCount: newFav ? prevCount + 1 : Math.max(0, prevCount - 1) };
    handleSongUpdate(optimistic as Song);

    try {
      const res = await fetch(`/api/songs/${song.id}/favorite`, {
        method: newFav ? "POST" : "DELETE",
      });
      if (!res.ok) {
        handleSongUpdate(song);
        toast("Failed to update favorite", "error");
      } else {
        const data = await res.json();
        handleSongUpdate({ ...song, isFavorite: newFav, favoriteCount: data.favoriteCount } as Song);
        toast(newFav ? "Added to favorites" : "Removed from favorites", "success");
      }
    } catch {
      handleSongUpdate(song);
      toast("Failed to update favorite", "error");
    }
  }

  // ─── Retry handler ──────────────────────────────────────────────────────
  async function handleRetry(song: Song) {
    if (retryingId) return;
    setRetryingId(song.id);

    try {
      const res = await fetch(`/api/songs/${song.id}/retry`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      const data = await res.json();

      if (!res.ok) {
        if (res.status === 429 && data.resetAt) {
          const resetTime = new Date(data.resetAt);
          const minutesLeft = Math.ceil((resetTime.getTime() - Date.now()) / 60000);
          toast(`Rate limit reached. Try again in ${minutesLeft} minute${minutesLeft === 1 ? "" : "s"}.`, "error");
        } else {
          toast(data.error ?? "Retry failed. Please try again.", "error");
        }
        return;
      }

      if (data.song) {
        handleSongUpdate(data.song);
      }
      toast("Retry started! Song is regenerating.", "success");
      router.refresh();
    } catch {
      toast("Network error. Please check your connection.", "error");
    } finally {
      setRetryingId(null);
    }
  }

  // ─── Selection handlers ──────────────────────────────────────────────────

  function handleToggleSelect(songId: string, shiftKey: boolean) {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      const songIndex = songs.findIndex((s) => s.id === songId);

      if (shiftKey && lastSelectedIndex !== null && songIndex !== -1) {
        const start = Math.min(lastSelectedIndex, songIndex);
        const end = Math.max(lastSelectedIndex, songIndex);
        for (let i = start; i <= end; i++) {
          next.add(songs[i].id);
        }
      } else if (next.has(songId)) {
        next.delete(songId);
      } else {
        next.add(songId);
      }

      return next;
    });
    const songIndex = songs.findIndex((s) => s.id === songId);
    if (songIndex !== -1) setLastSelectedIndex(songIndex);
  }

  function handleSelectAll() {
    if (selectedSongIds.size === songs.length) {
      setSelectedSongIds(new Set());
      setLastSelectedIndex(null);
    } else {
      setSelectedSongIds(new Set(songs.map((s) => s.id)));
    }
  }

  function clearSelection() {
    setSelectedSongIds(new Set());
    setLastSelectedIndex(null);
  }

  type BatchActionType = "favorite" | "unfavorite" | "delete" | "restore" | "permanent_delete";

  async function handleBatchAction(action: BatchActionType) {
    if (selectedSongIds.size === 0) return;

    if (action === "delete" || action === "permanent_delete") {
      setShowDeleteConfirm(true);
      return;
    }

    await executeBatchAction(action);
  }

  async function executeBatchAction(action: BatchActionType) {
    const songIds = Array.from(selectedSongIds);
    setBatchLoading(true);

    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, songIds }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Batch operation failed", "error");
        return;
      }

      const data = await res.json();
      const count = data.affected;

      if (action === "favorite") {
        setSongs((prev) =>
          prev.map((s) => (selectedSongIds.has(s.id) ? { ...s, isFavorite: true } : s))
        );
        toast(`${count} song${count !== 1 ? "s" : ""} added to favorites`, "success");
      } else if (action === "unfavorite") {
        setSongs((prev) =>
          prev.map((s) => (selectedSongIds.has(s.id) ? { ...s, isFavorite: false } : s))
        );
        toast(`${count} song${count !== 1 ? "s" : ""} removed from favorites`, "success");
      } else if (action === "delete") {
        setSongs((prev) => prev.filter((s) => !selectedSongIds.has(s.id)));
        toast(`${count} song${count !== 1 ? "s" : ""} moved to archive`, "success");
      } else if (action === "restore") {
        setSongs((prev) => prev.filter((s) => !selectedSongIds.has(s.id)));
        toast(`${count} song${count !== 1 ? "s" : ""} restored`, "success");
      } else if (action === "permanent_delete") {
        setSongs((prev) => prev.filter((s) => !selectedSongIds.has(s.id)));
        toast(`${count} song${count !== 1 ? "s" : ""} permanently deleted`, "success");
      }

      clearSelection();
    } catch {
      toast("Batch operation failed", "error");
    } finally {
      setBatchLoading(false);
      setShowDeleteConfirm(false);
    }
  }

  // ─── Per-song (menu) actions ──────────────────────────────────────────────

  async function handleSingleSongAction(song: Song, action: "delete" | "restore" | "permanent_delete") {
    if (action === "permanent_delete") {
      setPendingMenuDelete({ song });
      return;
    }

    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, songIds: [song.id] }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Action failed", "error");
        return;
      }
      if (action === "delete") {
        setSongs((prev) => prev.filter((s) => s.id !== song.id));
        toast(`"${song.title ?? "Song"}" moved to archive`, "success");
      } else if (action === "restore") {
        setSongs((prev) => prev.filter((s) => s.id !== song.id));
        toast(`"${song.title ?? "Song"}" restored`, "success");
      }
    } catch {
      toast("Action failed", "error");
    }
  }

  async function executePendingMenuDelete() {
    if (!pendingMenuDelete) return;
    const { song } = pendingMenuDelete;
    setMenuDeleteLoading(true);
    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "permanent_delete", songIds: [song.id] }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Delete failed", "error");
        return;
      }
      setSongs((prev) => prev.filter((s) => s.id !== song.id));
      toast(`"${song.title ?? "Song"}" permanently deleted`, "success");
      setPendingMenuDelete(null);
    } catch {
      toast("Delete failed", "error");
    } finally {
      setMenuDeleteLoading(false);
    }
  }

  // ─── Batch tag / playlist / download state ───────────────────────────────
  const [showBatchTagMenu, setShowBatchTagMenu] = useState(false);
  const [showBatchPlaylistMenu, setShowBatchPlaylistMenu] = useState(false);
  const [batchTagLoading, setBatchTagLoading] = useState(false);
  const [batchPlaylistLoading, setBatchPlaylistLoading] = useState(false);
  const [batchPlaylists, setBatchPlaylists] = useState<PlaylistOption[]>([]);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchDownloadProgress, setBatchDownloadProgress] = useState<{ completed: number; total: number } | null>(null);
  const batchTagMenuRef = useRef<HTMLDivElement>(null);
  const batchPlaylistMenuRef = useRef<HTMLDivElement>(null);

  // Close batch tag menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (batchTagMenuRef.current && !batchTagMenuRef.current.contains(e.target as Node)) {
        setShowBatchTagMenu(false);
      }
    }
    if (showBatchTagMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showBatchTagMenu]);

  // Close batch playlist menu on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (batchPlaylistMenuRef.current && !batchPlaylistMenuRef.current.contains(e.target as Node)) {
        setShowBatchPlaylistMenu(false);
      }
    }
    if (showBatchPlaylistMenu) {
      document.addEventListener("mousedown", handleClick);
      return () => document.removeEventListener("mousedown", handleClick);
    }
  }, [showBatchPlaylistMenu]);

  async function handleBatchTag(tagId: string) {
    setShowBatchTagMenu(false);
    if (selectedSongIds.size === 0) return;
    setBatchTagLoading(true);
    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "tag", songIds: Array.from(selectedSongIds), tagId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Batch tag failed", "error");
        return;
      }
      const data = await res.json();
      toast(`Tagged ${data.affected} song${data.affected !== 1 ? "s" : ""}`, "success");
      clearSelection();
      // Refresh songs to show updated tags
      router.refresh();
    } catch {
      toast("Batch tag failed", "error");
    } finally {
      setBatchTagLoading(false);
    }
  }

  async function handleBatchAddToPlaylist(playlistId: string) {
    setShowBatchPlaylistMenu(false);
    if (selectedSongIds.size === 0) return;
    setBatchPlaylistLoading(true);
    try {
      const res = await fetch("/api/songs/batch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "add_to_playlist", songIds: Array.from(selectedSongIds), playlistId }),
      });
      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Batch add to playlist failed", "error");
        return;
      }
      const data = await res.json();
      toast(`Added ${data.affected} song${data.affected !== 1 ? "s" : ""} to playlist`, "success");
      clearSelection();
    } catch {
      toast("Batch add to playlist failed", "error");
    } finally {
      setBatchPlaylistLoading(false);
    }
  }

  async function openBatchPlaylistMenu() {
    setShowBatchPlaylistMenu(true);
    try {
      const res = await fetch("/api/playlists");
      if (res.ok) {
        const data = await res.json();
        setBatchPlaylists(data.playlists);
      }
    } catch { /* ignore */ }
  }

  async function handleBatchDownload() {
    if (selectedSongIds.size === 0) return;
    const selectedSongs = songs
      .filter((s) => selectedSongIds.has(s.id) && s.audioUrl && s.generationStatus === "ready")
      .map((s) => ({
        id: s.id,
        title: s.title,
        audioUrl: s.audioUrl!,
        tags: s.tags,
        duration: s.duration,
        createdAt: s.createdAt,
      }));
    if (selectedSongs.length === 0) {
      toast("No downloadable songs selected", "info");
      return;
    }
    setBatchDownloading(true);
    setBatchDownloadProgress({ completed: 0, total: selectedSongs.length });
    try {
      await exportAsZip(selectedSongs, (completed, total) => {
        setBatchDownloadProgress({ completed, total });
      });
      toast(`Downloaded ${selectedSongs.length} song${selectedSongs.length !== 1 ? "s" : ""} as ZIP`, "success");
      clearSelection();
    } catch (err) {
      toast(err instanceof Error ? err.message : "Download failed", "error");
    } finally {
      setBatchDownloading(false);
      setBatchDownloadProgress(null);
    }
  }

  // ─── Export helpers ───────────────────────────────────────────────────────
  const exportableSongs = useMemo<ExportableSong[]>(() => {
    return songs
      .filter((s) => s.audioUrl && s.generationStatus === "ready")
      .map((s) => ({
        id: s.id,
        title: s.title,
        audioUrl: s.audioUrl!,
        tags: s.tags,
        duration: s.duration,
        createdAt: s.createdAt,
      }));
  }, [songs]);

  async function handleExportZip() {
    setExportMenuOpen(false);
    if (exportableSongs.length === 0) {
      toast("No songs available to export", "info");
      return;
    }
    if (exportableSongs.length > 50) {
      toast(`Exporting ${exportableSongs.length} songs — this may take a while`, "info");
    }
    setExporting(true);
    setExportProgress({ completed: 0, total: exportableSongs.length });
    try {
      await exportAsZip(exportableSongs, (completed, total) => {
        setExportProgress({ completed, total });
      });
      toast("ZIP export complete!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    } finally {
      setExporting(false);
      setExportProgress(null);
    }
  }

  function handleExportM3U() {
    setExportMenuOpen(false);
    if (exportableSongs.length === 0) {
      toast("No songs available to export", "info");
      return;
    }
    try {
      exportAsM3U(exportableSongs);
      toast("M3U playlist exported!", "success");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Export failed", "error");
    }
  }

  // ─── Play All ──────────────────────────────────────────────────────────────
  function handlePlayAll() {
    const allQueueSongs = songs
      .map(songToQueueSong)
      .filter((s): s is QueueSong => s !== null);
    if (allQueueSongs.length > 0) {
      playQueue(allQueueSongs, 0);
    }
  }

  const hasPlayableSongs = songs.some((s) => s.audioUrl && s.generationStatus === "ready");
  const hasActiveFilters = !!(statusFilter || ratingFilter || dateFrom || dateTo || tagFilter || smartFilter);

  // ─── Virtualizer for list view ───────────────────────────────────────────
  const listScrollMarginRef = useRef(0);
  useLayoutEffect(() => {
    listScrollMarginRef.current = songListRef.current?.offsetTop ?? 0;
  });

  const rowVirtualizer = useWindowVirtualizer({
    count: viewMode === "list" ? songs.length : 0,
    estimateSize: () => 120,
    overscan: 5,
    scrollMargin: listScrollMarginRef.current,
  });

  // ─── Infinite scroll sentinel ────────────────────────────────────────────
  const loadMoreSentinelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const sentinel = loadMoreSentinelRef.current;
    if (!sentinel || !nextCursor || loadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          handleLoadMore();
        }
      },
      { rootMargin: "300px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [nextCursor, loadingMore, handleLoadMore]);

  return (
    <div className="px-4 py-4 space-y-4" data-tour="library">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">{title}</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            {loading ? "Searching…" : `${songs.length}${totalSongs > songs.length ? ` of ${totalSongs}` : ""} song${totalSongs !== 1 ? "s" : ""}`}
          </p>
          {songs.length > 0 && (
            <button
              onClick={handleSelectAll}
              className="mt-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors"
            >
              {selectedSongIds.size === songs.length ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>

        {/* Header actions */}
        <div className="flex items-center gap-2">
          {/* Import from Suno button */}
          <button
            onClick={() => setSunoImportOpen(true)}
            aria-label="Import from Suno"
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors min-h-[44px]"
          >
            <CloudArrowDownIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Import</span>
          </button>

        {/* Export button */}
        <div className="relative" ref={exportMenuRef}>
          <button
            onClick={() => setExportMenuOpen((o) => !o)}
            disabled={exporting}
            aria-label="Export library"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              exporting
                ? "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                : "bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            }`}
          >
            <ArrowUpOnSquareStackIcon className="w-4 h-4" />
            {exporting && exportProgress
              ? `${exportProgress.completed}/${exportProgress.total}`
              : "Export"}
          </button>

          {exportMenuOpen && (
            <div className="absolute right-0 mt-1 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
              <button
                onClick={handleExportZip}
                className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Download as ZIP
              </button>
              <button
                onClick={handleExportM3U}
                className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-t border-gray-200 dark:border-gray-800"
              >
                Export M3U playlist
              </button>
            </div>
          )}
        </div>
        </div>
      </div>

      {/* Export progress bar */}
      {exporting && exportProgress && (
        <div className="space-y-1">
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((exportProgress.completed / exportProgress.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Downloading {exportProgress.completed} of {exportProgress.total} songs…
          </p>
        </div>
      )}

      {/* Play All button */}
      {hasPlayableSongs && !selectionMode && (
        <button
          onClick={handlePlayAll}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors min-h-[44px]"
        >
          <PlayOutlineIcon className="w-4 h-4" />
          Play All
        </button>
      )}

      {/* Search bar + filters */}
      {enableServerSearch && (
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

          {showFilters && (
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

              <select
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
                aria-label="Filter by tag"
                className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 text-base sm:text-sm text-gray-900 dark:text-white min-h-[44px]"
              >
                <option value="">All tags</option>
                {availableTags.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

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
      )}

      {/* Song list */}
      {songs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
          <MusicalNoteIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" aria-hidden="true" />
          {isArchiveView ? (
            <p className="text-gray-500 dark:text-gray-400 text-sm">Your archive is empty.</p>
          ) : hasAnyFilter ? (
            <>
              <p className="text-gray-500 dark:text-gray-400 text-sm">No songs match your filters.</p>
              <button
                onClick={clearAllFilters}
                className="mt-3 px-4 py-2 rounded-lg text-sm font-medium text-violet-600 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
              >
                Clear all filters
              </button>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No songs yet</h3>
              <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
                Create your first AI-generated song — describe a mood, genre, or vibe and let the music flow.
              </p>
              <Link
                href="/generate"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
              >
                Generate your first song
              </Link>
            </>
          )}
        </div>
      ) : viewMode === "grid" ? (
        <ul aria-label="Song library" className={`grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 ${selectionMode ? "pb-20" : ""}`}>
          {songs.map((song) => (
            <SongGridCard
              key={song.id}
              song={song}
              isActive={currentSongId === song.id}
              isPlaying={isPlaying}
              searchQuery={debouncedSearch}
              onTogglePlay={handleTogglePlay}
              onToggleFavorite={handleToggleFavorite}
            />
          ))}
        </ul>
      ) : (
        <div
          ref={songListRef}
          aria-label="Song library"
          role="listbox"
          aria-orientation="vertical"
          onKeyDown={handleSongListKeyDown}
          className={selectionMode ? "pb-20" : ""}
          style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const song = songs[virtualRow.index];
            return (
              <div
                key={virtualRow.key}
                data-index={virtualRow.index}
                ref={rowVirtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  transform: `translateY(${virtualRow.start - rowVirtualizer.options.scrollMargin}px)`,
                  paddingBottom: "0.5rem",
                }}
              >
                <SongRow
                  key={song.id}
                  initialSong={song}
                  isActive={currentSongId === song.id}
                  isPlaying={isPlaying}
                  currentTime={currentTime}
                  audioDuration={audioDuration}
                  rating={song.rating ? { stars: song.rating, note: song.ratingNote ?? "" } : undefined}
                  downloadProgress={downloadProgress[song.id] ?? null}
                  downloadError={downloadErrors[song.id] ?? null}
                  isSelected={selectedSongIds.has(song.id)}
                  selectionMode={selectionMode}
                  searchQuery={debouncedSearch}
                  onTogglePlay={handleTogglePlay}
                  onDownload={handleDownload}
                  onSeek={handleSeek}
                  onUpdate={handleSongUpdate}
                  onToggleFavorite={handleToggleFavorite}
                  onToggleSelect={handleToggleSelect}
                  onRetry={handleRetry}
                  retryingId={retryingId}
                  isArchiveView={isArchiveView}
                  onSingleArchive={(s) => handleSingleSongAction(s, "delete")}
                  onSingleRestore={(s) => handleSingleSongAction(s, "restore")}
                  onSingleDeleteForever={(s) => handleSingleSongAction(s, "permanent_delete")}
                />
              </div>
            );
          })}
        </div>
      )}

      {/* Infinite scroll sentinel + loading indicator */}
      {nextCursor && !loading && (
        <div ref={loadMoreSentinelRef} className="flex items-center justify-center py-4" aria-live="polite">
          {loadingMore ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
              <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Loading more…
            </span>
          ) : (
            <button
              onClick={handleLoadMore}
              className="text-sm text-violet-600 dark:text-violet-400 hover:underline"
            >
              Load more ({totalSongs - songs.length} remaining)
            </button>
          )}
        </div>
      )}

      {/* Batch download progress bar */}
      {batchDownloading && batchDownloadProgress && (
        <div className="space-y-1">
          <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-300"
              style={{ width: `${Math.round((batchDownloadProgress.completed / batchDownloadProgress.total) * 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            Downloading {batchDownloadProgress.completed} of {batchDownloadProgress.total} songs…
          </p>
        </div>
      )}

      {/* Floating action bar */}
      {selectionMode && (
        <div className="fixed bottom-20 md:bottom-4 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex items-center gap-2 px-4 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl border border-gray-700 animate-slide-in overflow-x-auto">
          <span className="text-sm font-medium mr-1 flex-shrink-0">
            {selectedSongIds.size} selected
          </span>

          <button
            onClick={() => handleBatchAction("favorite")}
            disabled={batchLoading}
            aria-label="Add selected to favorites"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-pink-600 hover:bg-pink-500 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <HeartIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Favorite</span>
          </button>

          <button
            onClick={() => handleBatchAction("unfavorite")}
            disabled={batchLoading}
            aria-label="Remove selected from favorites"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <HeartOutlineIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Unfavorite</span>
          </button>

          {/* Batch Tag */}
          <div className="relative" ref={batchTagMenuRef}>
            <button
              onClick={() => setShowBatchTagMenu((o) => !o)}
              disabled={batchTagLoading || availableTags.length === 0}
              aria-label="Tag selected songs"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <TagIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Tag</span>
            </button>

            {showBatchTagMenu && (
              <div className="absolute bottom-full mb-1 left-0 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
                {availableTags.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No tags yet</p>
                ) : (
                  availableTags.map((tag) => (
                    <button
                      key={tag.id}
                      onClick={() => handleBatchTag(tag.id)}
                      className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b last:border-b-0 border-gray-200 dark:border-gray-800 flex items-center gap-2"
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: tag.color }}
                      />
                      {tag.name}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Batch Add to Playlist */}
          <div className="relative" ref={batchPlaylistMenuRef}>
            <button
              onClick={openBatchPlaylistMenu}
              disabled={batchPlaylistLoading}
              aria-label="Add selected to playlist"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <QueueListIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Playlist</span>
            </button>

            {showBatchPlaylistMenu && (
              <div className="absolute bottom-full mb-1 left-0 w-48 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl shadow-lg z-50 overflow-hidden max-h-60 overflow-y-auto">
                {batchPlaylists.length === 0 ? (
                  <p className="px-4 py-3 text-sm text-gray-500">No playlists yet</p>
                ) : (
                  batchPlaylists.map((pl) => (
                    <button
                      key={pl.id}
                      onClick={() => handleBatchAddToPlaylist(pl.id)}
                      className="w-full text-left px-4 py-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors border-b last:border-b-0 border-gray-200 dark:border-gray-800"
                    >
                      {pl.name}
                      <span className="text-xs text-gray-500 dark:text-gray-400 ml-1">
                        ({pl._count.songs})
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          {/* Batch Download */}
          <button
            onClick={handleBatchDownload}
            disabled={batchDownloading}
            aria-label="Download selected songs as ZIP"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span className="hidden sm:inline">
              {batchDownloading && batchDownloadProgress
                ? `${batchDownloadProgress.completed}/${batchDownloadProgress.total}`
                : "Download"}
            </span>
          </button>

          {isArchiveView ? (
            <>
              <button
                onClick={() => handleBatchAction("restore")}
                disabled={batchLoading}
                aria-label="Restore selected songs"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-green-600 hover:bg-green-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                <ArrowPathIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Restore</span>
              </button>
              <button
                onClick={() => handleBatchAction("permanent_delete")}
                disabled={batchLoading}
                aria-label="Permanently delete selected songs"
                className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                <TrashIcon className="w-4 h-4" />
                <span className="hidden sm:inline">Delete forever</span>
              </button>
            </>
          ) : (
            <button
              onClick={() => handleBatchAction("delete")}
              disabled={batchLoading}
              aria-label="Delete selected songs"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
            >
              <TrashIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Delete</span>
            </button>
          )}

          <button
            onClick={clearSelection}
            aria-label="Clear selection"
            className="flex-shrink-0 ml-1 p-2 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors min-h-[44px]"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Delete / Permanent delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-title" onKeyDown={(e) => { if (e.key === "Escape") setShowDeleteConfirm(false); }}>
          <div className="bg-white dark:bg-gray-900 w-full sm:rounded-2xl rounded-t-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 sm:mx-4 sm:max-w-sm">
            <h3 id="delete-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              {isArchiveView
                ? `Permanently delete ${selectedSongIds.size} song${selectedSongIds.size !== 1 ? "s" : ""}?`
                : `Delete ${selectedSongIds.size} song${selectedSongIds.size !== 1 ? "s" : ""}?`}
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              {isArchiveView
                ? "This action cannot be undone. The selected songs will be permanently removed from your library."
                : "The selected songs will be moved to your archive. You can restore them later."}
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={batchLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={() => executeBatchAction(isArchiveView ? "permanent_delete" : "delete")}
                disabled={batchLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                {batchLoading
                  ? (isArchiveView ? "Deleting forever…" : "Archiving…")
                  : (isArchiveView ? "Delete forever" : "Delete")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-song menu: permanent delete confirmation */}
      {pendingMenuDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="menu-delete-dialog-title"
          onKeyDown={(e) => { if (e.key === "Escape") setPendingMenuDelete(null); }}
        >
          <div className="bg-white dark:bg-gray-900 w-full sm:rounded-2xl rounded-t-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 sm:mx-4 sm:max-w-sm">
            <h3 id="menu-delete-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Permanently delete &ldquo;{pendingMenuDelete.song.title ?? "this song"}&rdquo;?
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              This action cannot be undone. The song will be permanently removed from your library.
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setPendingMenuDelete(null)}
                disabled={menuDeleteLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={executePendingMenuDelete}
                disabled={menuDeleteLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                {menuDeleteLoading ? "Deleting…" : "Delete forever"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Suno import modal */}
      {sunoImportOpen && (
        <SunoImportModal
          onClose={() => setSunoImportOpen(false)}
          onImportComplete={() => router.refresh()}
        />
      )}
    </div>
  );
}
