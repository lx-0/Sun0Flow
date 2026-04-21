"use client";

import { memo, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  MusicalNoteIcon,
  ArrowDownTrayIcon,
  HeartIcon,
  CheckIcon,
  ArrowPathIcon,
  EllipsisVerticalIcon,
  ArchiveBoxIcon,
  ArrowUturnLeftIcon,
  TrashIcon,
  ForwardIcon,
} from "@heroicons/react/24/solid";
import {
  HeartIcon as HeartOutlineIcon,
  QueueListIcon,
  SignalSlashIcon,
  CloudArrowDownIcon,
} from "@heroicons/react/24/outline";
import { CoverArtImage } from "./CoverArtImage";
import type { Song } from "@prisma/client";
import type { SongRating } from "@/lib/ratings";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";
import { TagChip } from "./TagInput";
import { ShareButton } from "./ShareButton";
import { AddToPlaylistButton } from "./AddToPlaylistButton";
import { useRouter } from "next/navigation";

// ─── Types ───────────────────────────────────────────────────────────────────

interface SongTagRelation {
  tag: { id: string; name: string; color: string };
}

type SongWithTags = Song & { songTags: SongTagRelation[] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Highlight matching search terms in text with bold spans. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || query.length < 3) return <>{text}</>;
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
const MAX_POLL_ATTEMPTS = 60;

function usePollSong(song: Song, onUpdate: (updated: Song) => void) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;

    if (song.generationStatus !== "pending") return;

    let attempts = 0;
    async function pollWithLimit() {
      if (!activeRef.current || attempts >= MAX_POLL_ATTEMPTS) return;
      attempts++;
      try {
        const res = await fetch(`/api/songs/${song.id}/status`);
        if (!res.ok) return;
        const data = (await res.json()) as { song: Song };
        if (!activeRef.current) return;
        if (data.song.generationStatus !== "pending") {
          onUpdate(data.song);
          return;
        }
      } catch {
        // ignore
      }
      if (activeRef.current) {
        timerRef.current = setTimeout(pollWithLimit, POLL_INTERVAL_MS);
      }
    }

    timerRef.current = setTimeout(pollWithLimit, POLL_INTERVAL_MS);

    return () => {
      activeRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [song.id, song.generationStatus, onUpdate]);
}

// ─── Per-song action menu (three-dot/kebab) ───────────────────────────────────

interface SongRowMenuProps {
  song: Song;
  isArchiveView: boolean;
  hasAudio: boolean;
  onToggleFavorite: (song: Song) => void;
  onSongUpdate: (updated: Partial<Song>) => void;
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
  onSongUpdate,
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
            <ShareButton
              song={song}
              onUpdate={(updated) => {
              setOpen(false);
              onSongUpdate({ ...updated, isPublic: updated.isPublic ?? false });
            }}
              compact={false}
              source="library_card_menu"
              className={itemClass}
            />
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

// ─── SongListItem Props ──────────────────────────────────────────────────────

export interface SongListItemProps {
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
  isCached: boolean;
  isSaving: boolean;
  isOnline: boolean;
  onTogglePlay: (song: Song) => void;
  onDownload: (song: Song) => void;
  onSaveOffline: (song: Song) => void;
  onRemoveOffline: (songId: string) => void;
  onSeek: (pct: number) => void;
  onUpdate: (updated: Song) => void;
  onToggleFavorite: (song: Song) => void;
  onToggleSelect: (songId: string, shiftKey: boolean) => void;
  onLongPress: (songId: string) => void;
  onRetry: (song: Song) => void;
  retryingId: string | null;
  isArchiveView: boolean;
  onSingleArchive: (song: Song) => void;
  onSingleRestore: (song: Song) => void;
  onSingleDeleteForever: (song: Song) => void;
  onTagClick?: (tagId: string) => void;
}

// ─── SongListItem ────────────────────────────────────────────────────────────

export const SongListItem = memo(function SongListItem({
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
  isCached,
  isSaving,
  isOnline,
  onTogglePlay,
  onDownload,
  onSaveOffline,
  onRemoveOffline,
  onSeek,
  onUpdate,
  onToggleFavorite,
  onToggleSelect,
  onLongPress,
  onRetry,
  retryingId,
  isArchiveView,
  onSingleArchive,
  onSingleRestore,
  onSingleDeleteForever,
  onTagClick,
}: SongListItemProps) {
  const { toast } = useToast();
  const [song, setSong] = useState(initialSong);

  // Long-press to enter selection mode on mobile
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  function handleTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    touchStartPos.current = { x: t.clientX, y: t.clientY };
    longPressTimer.current = setTimeout(() => {
      onLongPress(song.id);
    }, 500);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartPos.current.x;
    const dy = t.clientY - touchStartPos.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleTouchEnd() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
    touchStartPos.current = null;
  }

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

  const songTitle = song.title ?? "Untitled";
  const statusText = isPending ? ", generating" : isFailed ? ", failed" : "";
  const ratingText = rating ? `, ${rating.stars} of 5 stars` : "";
  const songAriaLabel = `${songTitle}${statusText}${ratingText}`;

  return (
    <div
      role="option"
      tabIndex={0}
      aria-selected={isActive}
      aria-label={songAriaLabel}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`group bg-white dark:bg-gray-900 border rounded-xl transition-colors ${
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
            <CoverArtImage src={song.imageUrl} alt={song.title ?? "Song"} fill className="object-cover" sizes="48px" loading="lazy" songId={song.id} />
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
                  <TagChip key={st.tag.id} tag={st.tag} size="xs" onClick={() => onTagClick?.(st.tag.id)} />
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
            {!isOnline && !isCached && hasAudio && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 flex-shrink-0">
                <SignalSlashIcon className="w-3 h-3" aria-hidden="true" />
                Unavailable offline
              </span>
            )}
            {isCached && (
              <span className="inline-flex items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400 flex-shrink-0" title="Available offline">
                <CheckIcon className="w-3 h-3" aria-hidden="true" />
                Offline
              </span>
            )}
            {!isPending && !isFailed && ((song as Song & { variationCount?: number }).variationCount ?? 0) > 0 && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 text-gray-600 dark:text-gray-400 text-[10px] font-medium">
                {((song as Song & { variationCount?: number }).variationCount ?? 0) + 1} versions
              </span>
            )}
            {song.source === "auto" && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-900/50 border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-[10px] font-medium">
                Auto
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

        {hasAudio && (
          <ShareButton
            song={song}
            onUpdate={(updated) => {
              const next = { ...song, ...updated, isPublic: updated.isPublic ?? song.isPublic };
              setSong(next);
              onUpdate(next);
            }}
            source="library_card"
            className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              song.isPublic
                ? "bg-violet-100 dark:bg-violet-800 hover:bg-violet-200 dark:hover:bg-violet-700 text-violet-700 dark:text-violet-300"
                : "bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            }`}
          />
        )}

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

        {hasAudio && (
          <button
            onClick={() => isCached ? onRemoveOffline(song.id) : onSaveOffline(song)}
            disabled={isSaving}
            aria-label={isCached ? "Remove from offline cache" : isSaving ? "Saving for offline…" : "Save for offline playback"}
            className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
              isCached
                ? "bg-emerald-100 dark:bg-emerald-900/40 hover:bg-red-100 dark:hover:bg-red-900/40 text-emerald-600 dark:text-emerald-400 hover:text-red-500 dark:hover:text-red-400"
                : isSaving
                  ? "bg-gray-200 dark:bg-gray-800 text-gray-400 dark:text-gray-500 cursor-not-allowed"
                  : "bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            }`}
          >
            {isSaving ? (
              <svg className="animate-spin h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" aria-hidden="true">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : isCached ? (
              <CheckIcon className="w-5 h-5" aria-hidden="true" />
            ) : (
              <CloudArrowDownIcon className="w-5 h-5" aria-hidden="true" />
            )}
          </button>
        )}

        <AddToPlaylistButton songId={song.id} />

        <SongRowMenu
          song={song}
          isArchiveView={isArchiveView}
          hasAudio={hasAudio}
          onToggleFavorite={onToggleFavorite}
          onSongUpdate={(updated) => {
            const next = { ...song, ...updated, isPublic: updated.isPublic ?? song.isPublic };
            setSong(next);
            onUpdate(next);
          }}
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
});

// Re-export the props type alias that LibraryView uses internally as SongRowProps
export type SongRowProps = SongListItemProps;
