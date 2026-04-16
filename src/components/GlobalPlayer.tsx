"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PlayIcon,
  PauseIcon,
  ForwardIcon,
  BackwardIcon,
  XMarkIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  HeartIcon,
} from "@heroicons/react/24/solid";
import {
  ArrowPathRoundedSquareIcon,
  ArrowsRightLeftIcon,
  MusicalNoteIcon,
  QueueListIcon,
  DocumentTextIcon,
  HeartIcon as HeartOutlineIcon,
  FaceSmileIcon,
  AdjustmentsHorizontalIcon,
  ChatBubbleLeftIcon,
  CubeIcon,
} from "@heroicons/react/24/outline";
import Link from "next/link";
import { CoverArtImage } from "./CoverArtImage";
import { useQueue } from "./QueueContext";
import { UpNextPanel } from "./UpNextPanel";
import { LyricsPanel } from "./LyricsPanel";
import { EqualizerPanel } from "./EqualizerPanel";
import { PlayerWaveform } from "./PlayerWaveform";
import { EmojiReactionPicker } from "./EmojiReactionPicker";
import { ReactionTimeline, ReactionItem } from "./ReactionTimeline";
import { useToast } from "./Toast";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import { ExpandedPlayer } from "./ExpandedPlayer";
import {
  Drawer,
  DrawerContent,
  DrawerHandle,
  DrawerTitle,
} from "./ui/drawer";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function GlobalPlayer({ sidebarCollapsed }: { sidebarCollapsed?: boolean }) {
  const {
    queue,
    currentIndex,
    isPlaying,
    isBuffering,
    currentTime,
    duration,
    shuffle,
    repeat,
    volume,
    muted,
    playlistSource,
    radioState,
    togglePlay,
    skipNext,
    skipPrev,
    seek,
    toggleShuffle,
    cycleRepeat,
    clearQueue,
    setVolume,
    toggleMute,
    shuffleVersions,
    toggleShuffleVersions,
    activeVersion,
  } = useQueue();

  const [showUpNext, setShowUpNext] = useState(false);
  const [showLyrics, setShowLyrics] = useState(false);
  const [showEQ, setShowEQ] = useState(false);
  const [showReactions, setShowReactions] = useState(false);
  const [isFavorite, setIsFavorite] = useState(false);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const reactionSongIdRef = useRef<string | null>(null);

  // Expanded player drawer state
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Timestamped comments — for waveform markers and playback overlays
  interface TimestampedComment { id: string; timestamp: number; body: string; username: string | null; }
  const [timedComments, setTimedComments] = useState<TimestampedComment[]>([]);
  const timedCommentSongIdRef = useRef<string | null>(null);
  interface CommentPopup { id: string; body: string; username: string | null; key: number; leftPct: number; }
  const [activeCommentPopups, setActiveCommentPopups] = useState<CommentPopup[]>([]);
  const shownCommentIdsRef = useRef<Set<string>>(new Set());
  const commentPopupKeyRef = useRef(0);

  // Emoji popup state — floats up from the waveform when currentTime passes a reaction
  interface EmojiPopup { id: string; emoji: string; key: number; leftPct: number; }
  const [activePopups, setActivePopups] = useState<EmojiPopup[]>([]);
  const shownReactionIdsRef = useRef<Set<string>>(new Set());
  const popupKeyRef = useRef(0);
  const pathname = usePathname();
  const { data: session } = useSession();
  const { toast } = useToast();

  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  // Fetch favorite status when current song changes
  useEffect(() => {
    if (!currentSong?.id || !session?.user) {
      setIsFavorite(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/songs/${currentSong.id}`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.song) setIsFavorite(data.song.isFavorite ?? false);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentSong?.id, session?.user]);

  // Fetch reactions when song changes
  useEffect(() => {
    if (!currentSong?.id) {
      setReactions([]);
      reactionSongIdRef.current = null;
      return;
    }
    if (reactionSongIdRef.current === currentSong.id) return;
    reactionSongIdRef.current = currentSong.id;
    setReactions([]);
    let cancelled = false;
    fetch(`/api/songs/${currentSong.id}/reactions`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.reactions) setReactions(data.reactions);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentSong?.id]);

  // Fetch timestamped comments when song changes
  useEffect(() => {
    if (!currentSong?.id) {
      setTimedComments([]);
      timedCommentSongIdRef.current = null;
      return;
    }
    if (timedCommentSongIdRef.current === currentSong.id) return;
    timedCommentSongIdRef.current = currentSong.id;
    setTimedComments([]);
    let cancelled = false;
    fetch(`/api/songs/${currentSong.id}/comments?page=1`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.comments) {
          const timed: TimestampedComment[] = data.comments
            .filter((c: { timestamp: number | null }) => c.timestamp !== null)
            .map((c: { id: string; timestamp: number; body: string; user: { name: string | null } }) => ({
              id: c.id,
              timestamp: c.timestamp,
              body: c.body,
              username: c.user?.name ?? null,
            }));
          setTimedComments(timed);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [currentSong?.id]);

  // Reset comment popup tracking when song changes
  useEffect(() => {
    shownCommentIdsRef.current = new Set();
    setActiveCommentPopups([]);
  }, [currentSong?.id]);

  // Trigger comment overlays as currentTime passes comment timestamps during playback
  useEffect(() => {
    if (!isPlaying || timedComments.length === 0 || duration <= 0) return;
    const newlyTriggered = timedComments.filter(
      (c) => c.timestamp <= currentTime && !shownCommentIdsRef.current.has(c.id)
    );
    if (newlyTriggered.length === 0) return;
    for (const c of newlyTriggered) {
      shownCommentIdsRef.current.add(c.id);
    }
    const newPopups: CommentPopup[] = newlyTriggered.map((c) => {
      const key = ++commentPopupKeyRef.current;
      const leftPct = Math.min(95, Math.max(5, (c.timestamp / duration) * 100));
      return { id: c.id, body: c.body, username: c.username, key, leftPct };
    });
    setActiveCommentPopups((prev) => [...prev, ...newPopups]);
    const keys = newPopups.map((p) => p.key);
    const timer = setTimeout(() => {
      setActiveCommentPopups((prev) => prev.filter((p) => !keys.includes(p.key)));
    }, 3000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, isPlaying]);

  const handleReact = useCallback(
    async (emoji: string) => {
      if (!currentSong?.id) return;
      const timestamp = Math.max(0, Math.min(currentTime, duration ?? currentTime));

      // Optimistic update
      const optimistic: ReactionItem = {
        id: `optimistic-${Date.now()}`,
        emoji,
        timestamp,
        userId: session?.user?.id ?? "",
        username: session?.user?.name ?? undefined,
      };
      setReactions((prev) => [...prev, optimistic]);

      try {
        const res = await fetch(`/api/songs/${currentSong.id}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji, timestamp }),
        });

        if (res.status === 429) {
          // Remove optimistic, show message
          setReactions((prev) => prev.filter((r) => r.id !== optimistic.id));
          toast("Slow down! Too many reactions.", "info");
          return;
        }

        if (!res.ok) {
          setReactions((prev) => prev.filter((r) => r.id !== optimistic.id));
          toast("Couldn't save reaction. Try again.", "error");
          return;
        }

        const created: ReactionItem = await res.json();
        // Replace optimistic entry with real one
        setReactions((prev) =>
          prev.map((r) => (r.id === optimistic.id ? { ...created, username: session?.user?.name ?? undefined } : r))
        );
      } catch {
        setReactions((prev) => prev.filter((r) => r.id !== optimistic.id));
        toast("Couldn't save reaction. Try again.", "error");
      }
    },
    [currentSong?.id, currentTime, duration, session, toast]
  );

  async function handleToggleFavorite() {
    if (!currentSong) return;
    const prev = isFavorite;
    const newFav = !prev;
    setIsFavorite(newFav);
    try {
      const res = await fetch(`/api/songs/${currentSong.id}/favorite`, {
        method: newFav ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setIsFavorite(prev);
      }
    } catch {
      setIsFavorite(prev);
    }
  }

  // Reset popup tracking when the song changes
  useEffect(() => {
    shownReactionIdsRef.current = new Set();
    setActivePopups([]);
  }, [currentSong?.id]);

  // Trigger emoji popups as currentTime passes reaction timestamps
  useEffect(() => {
    if (!isPlaying || reactions.length === 0 || duration <= 0) return;
    const newlyTriggered = reactions.filter(
      (r) => r.timestamp <= currentTime && !shownReactionIdsRef.current.has(r.id)
    );
    if (newlyTriggered.length === 0) return;
    for (const r of newlyTriggered) {
      shownReactionIdsRef.current.add(r.id);
    }
    const newPopups: EmojiPopup[] = newlyTriggered.map((r) => {
      const key = ++popupKeyRef.current;
      const leftPct = Math.min(98, Math.max(2, (r.timestamp / duration) * 100));
      return { id: r.id, emoji: r.emoji, key, leftPct };
    });
    setActivePopups((prev) => [...prev, ...newPopups]);
    const ids = newPopups.map((p) => p.key);
    const timer = setTimeout(() => {
      setActivePopups((prev) => prev.filter((p) => !ids.includes(p.key)));
    }, 2000);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTime, isPlaying]);

  // Close reaction picker when playback stops
  useEffect(() => {
    if (!isPlaying) setShowReactions(false);
  }, [isPlaying]);

  // Close lyrics when navigating to song detail page
  useEffect(() => {
    if (pathname?.includes("/library/")) {
      setShowLyrics(false);
    }
  }, [pathname]);

  // Close lyrics when current song changes to one without lyrics
  useEffect(() => {
    if (!currentSong?.lyrics) {
      setShowLyrics(false);
    }
  }, [currentSong?.id, currentSong?.lyrics]);

  if (!currentSong) return null;

  return (
    <Drawer open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
    <div role="region" aria-label="Audio player" className={`fixed bottom-16 left-0 right-0 z-20 px-2 md:bottom-0 transition-all duration-200 ${sidebarCollapsed ? "md:left-16" : "md:left-56"}`}>
      {/* Lyrics panel */}
      {showLyrics && currentSong?.lyrics && (
        <div className="max-w-3xl mx-auto md:mx-0 mb-1">
          <LyricsPanel
            lyrics={currentSong.lyrics}
            songTitle={currentSong.title}
            onClose={() => setShowLyrics(false)}
          />
        </div>
      )}

      {/* Up Next panel */}
      {showUpNext && (
        <div className="max-w-3xl mx-auto md:mx-0 mb-1">
          <UpNextPanel onClose={() => setShowUpNext(false)} />
        </div>
      )}

      {/* Equalizer panel */}
      {showEQ && (
        <div className="max-w-3xl mx-auto md:mx-0 mb-1">
          <EqualizerPanel onClose={() => setShowEQ(false)} />
        </div>
      )}

      {/* Wrapper gives us a relative origin for popups that escape overflow-hidden */}
      <div className="relative max-w-3xl mx-auto md:mx-0">
        {/* Floating emoji popups — rendered outside overflow-hidden so they can float up */}
        {activePopups.length > 0 && (
          <div className="pointer-events-none absolute inset-x-2 bottom-14 h-0">
            {activePopups.map((popup) => (
              <span
                key={popup.key}
                className="absolute text-2xl leading-none animate-emoji-float"
                style={{ left: `${popup.leftPct}%` }}
                aria-hidden="true"
              >
                {popup.emoji}
              </span>
            ))}
          </div>
        )}

        {/* Floating comment popups — appear above waveform at the comment's timestamp position */}
        {activeCommentPopups.length > 0 && (
          <div className="pointer-events-none absolute inset-x-2 bottom-14 h-0 z-10">
            {activeCommentPopups.map((popup) => (
              <div
                key={popup.key}
                className="absolute bottom-2 flex flex-col items-center gap-0.5 animate-emoji-float"
                style={{ left: `${popup.leftPct}%`, transform: "translateX(-50%)" }}
                aria-hidden="true"
              >
                <div className="bg-gray-800/90 border border-violet-500/50 text-white text-xs px-2 py-1 rounded-lg shadow-lg max-w-[160px] text-center leading-tight">
                  {popup.username && (
                    <span className="block text-[10px] text-violet-400 font-medium truncate">{popup.username}</span>
                  )}
                  <span className="line-clamp-2">{popup.body}</span>
                </div>
                <ChatBubbleLeftIcon className="w-3 h-3 text-violet-400" />
              </div>
            ))}
          </div>
        )}

      <div className="bg-gray-900 dark:bg-gray-800 rounded-2xl md:rounded-none md:rounded-t-2xl shadow-2xl border border-gray-700 dark:border-gray-600 overflow-hidden">
        {/* Waveform seek bar + reaction timeline overlay */}
        <div className="relative h-12 px-2 pt-1 pb-0.5 bg-gray-900 dark:bg-gray-800">
          <PlayerWaveform
            songId={currentSong.id}
            currentTime={currentTime}
            duration={duration}
            isBuffering={isBuffering}
            onSeek={seek}
            reactionTimestamps={reactions.map((r) => r.timestamp)}
            commentTimestamps={timedComments.map((c) => c.timestamp)}
          />
          {reactions.length > 0 && duration > 0 && (
            <div className="absolute inset-x-2 top-0 bottom-0 pointer-events-none">
              <div className="pointer-events-auto">
                <ReactionTimeline reactions={reactions} duration={duration} />
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2.5 sm:gap-2 px-2 sm:px-3 py-3">
          {/* Cover art — tap to expand on mobile, link on desktop */}
          <button
            onClick={() => setIsDrawerOpen(true)}
            className="relative flex-shrink-0 w-12 h-12 rounded-lg bg-gray-800 dark:bg-gray-700 overflow-hidden flex items-center justify-center hover:ring-2 hover:ring-violet-500/50 transition-all md:hidden"
            aria-label="Expand player"
          >
            {currentSong.imageUrl ? (
              <CoverArtImage
                src={currentSong.imageUrl}
                alt={currentSong.title ?? "Song"}
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <MusicalNoteIcon className="w-5 h-5 text-gray-500" aria-hidden="true" />
            )}
          </button>
          <Link
            href={`/library/${currentSong.id}`}
            className="relative flex-shrink-0 w-10 h-10 rounded-lg bg-gray-800 dark:bg-gray-700 overflow-hidden items-center justify-center hover:ring-2 hover:ring-violet-500/50 transition-all hidden md:flex"
            title="View song details"
          >
            {currentSong.imageUrl ? (
              <CoverArtImage
                src={currentSong.imageUrl}
                alt={currentSong.title ?? "Song"}
                fill
                className="object-cover"
                sizes="40px"
              />
            ) : (
              <MusicalNoteIcon className="w-5 h-5 text-gray-500" aria-hidden="true" />
            )}
          </Link>

          {/* Song info — tap to expand on mobile */}
          <div className="flex-1 min-w-0" onClick={() => setIsDrawerOpen(true)} role="button" tabIndex={0} aria-label="Expand player" onKeyDown={(e) => { if (e.key === "Enter") setIsDrawerOpen(true); }}>
            <div className="flex items-center gap-1.5">
              <span
                className="text-sm font-medium text-white truncate hover:text-violet-400 transition-colors cursor-pointer"
                aria-live="polite"
              >
                {currentSong.title ?? "Untitled"}
              </span>
              {activeVersion && activeVersion.id !== currentSong.id && (
                <span className="flex-shrink-0 text-[10px] font-medium text-violet-400 bg-violet-400/10 px-1.5 py-0.5 rounded">
                  Alt version
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>/</span>
              <span>{formatTime(duration)}</span>
              {radioState ? (
                <span className="ml-auto hidden sm:inline-flex items-center gap-1 text-purple-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse inline-block" />
                  Radio{radioState.mood ? `: ${radioState.mood}` : ""}
                </span>
              ) : playlistSource ? (
                <span className="ml-auto hidden sm:inline truncate max-w-[120px]" title={`Playing from: ${playlistSource}`}>
                  Playing from: {playlistSource}
                </span>
              ) : (
                <span className="ml-auto hidden sm:inline">
                  {currentIndex + 1} of {queue.length}
                </span>
              )}
            </div>
          </div>

          {/* Emoji reaction toggle — only when playing and authenticated */}
          {isPlaying && !!session?.user && (
            <div className="relative flex-shrink-0">
              <button
                onClick={() => setShowReactions((v) => !v)}
                aria-label={showReactions ? "Hide reactions" : "React with emoji"}
                aria-expanded={showReactions}
                className={`w-8 h-8 flex items-center justify-center rounded-full transition-colors ${
                  showReactions
                    ? "text-violet-400 bg-white/10"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                <FaceSmileIcon className="w-5 h-5" />
              </button>
              {showReactions && (
                <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-30">
                  <EmojiReactionPicker
                    isPlaying={isPlaying}
                    isAuthenticated={!!session?.user}
                    onReact={handleReact}
                    reactionEmojis={reactions.map((r) => r.emoji)}
                  />
                </div>
              )}
            </div>
          )}

          {/* Favorite button — only shown when authenticated */}
          {session?.user && (
            <button
              onClick={handleToggleFavorite}
              aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
              className={`flex-shrink-0 w-8 h-8 flex items-center justify-center transition-colors ${
                isFavorite ? "text-pink-500" : "text-gray-400 hover:text-pink-400"
              }`}
            >
              {isFavorite ? (
                <HeartIcon className="w-5 h-5" />
              ) : (
                <HeartOutlineIcon className="w-5 h-5" />
              )}
            </button>
          )}

          {/* Volume — hidden on mobile */}
          <div className="hidden sm:flex items-center gap-1 mr-1">
            <button
              onClick={toggleMute}
              aria-label={muted ? "Unmute" : "Mute"}
              className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-200 transition-colors"
            >
              {muted || volume === 0 ? (
                <SpeakerXMarkIcon className="w-4 h-4" />
              ) : (
                <SpeakerWaveIcon className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : Math.round(volume * 100)}
              onChange={(e) => setVolume(Number(e.target.value) / 100)}
              aria-label="Volume"
              className="w-16 h-1 accent-violet-500 cursor-pointer"
            />
          </div>

          {/* Controls — touch-friendly targets */}
          <div className="flex items-center gap-1">
            {/* Shuffle */}
            <button
              onClick={toggleShuffle}
              aria-label={shuffle ? "Shuffle on" : "Shuffle off"}
              className={`hidden sm:flex w-11 h-11 rounded-full items-center justify-center transition-colors ${
                shuffle
                  ? "text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <ArrowsRightLeftIcon className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Shuffle Versions */}
            <button
              onClick={toggleShuffleVersions}
              aria-label={shuffleVersions ? "Shuffle versions on" : "Shuffle versions off"}
              title="Shuffle across versions — randomly play different versions of songs"
              className={`hidden sm:flex w-11 h-11 rounded-full items-center justify-center transition-colors ${
                shuffleVersions
                  ? "text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <CubeIcon className="w-5 h-5" aria-hidden="true" />
            </button>

            {/* Skip prev */}
            <button
              onClick={skipPrev}
              aria-label="Previous"
              className="w-11 h-11 rounded-full flex items-center justify-center text-white hover:text-violet-400 transition-colors"
            >
              <BackwardIcon className="w-6 h-6" aria-hidden="true" />
            </button>

            {/* Play/pause */}
            <button
              onClick={() => togglePlay()}
              aria-label={isBuffering ? "Loading" : isPlaying ? "Pause" : "Play"}
              disabled={isBuffering}
              className="w-12 h-12 rounded-full bg-violet-600 hover:bg-violet-500 disabled:opacity-75 text-white flex items-center justify-center transition-colors"
            >
              {isBuffering ? (
                <svg className="w-6 h-6 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : isPlaying ? (
                <PauseIcon className="w-6 h-6" />
              ) : (
                <PlayIcon className="w-6 h-6 ml-0.5" />
              )}
            </button>

            {/* Skip next */}
            <button
              onClick={skipNext}
              aria-label="Next"
              className="w-11 h-11 rounded-full flex items-center justify-center text-white hover:text-violet-400 transition-colors"
            >
              <ForwardIcon className="w-6 h-6" aria-hidden="true" />
            </button>

            {/* Repeat */}
            <button
              onClick={cycleRepeat}
              aria-label={`Repeat: ${repeat}`}
              className={`hidden sm:flex relative w-11 h-11 rounded-full items-center justify-center transition-colors ${
                repeat !== "off"
                  ? "text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <ArrowPathRoundedSquareIcon className="w-5 h-5" aria-hidden="true" />
              {repeat === "repeat-one" && (
                <span className="absolute -top-0.5 -right-0.5 text-[8px] font-bold text-violet-400">
                  1
                </span>
              )}
            </button>

            {/* Lyrics toggle — only shown when current song has lyrics */}
            {currentSong?.lyrics && (
              <button
                onClick={() => setShowLyrics((v) => !v)}
                aria-label={showLyrics ? "Hide lyrics" : "Show lyrics"}
                aria-expanded={showLyrics}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  showLyrics
                    ? "text-violet-400"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                <DocumentTextIcon className="w-6 h-6" />
              </button>
            )}

            {/* EQ toggle */}
            <button
              onClick={() => setShowEQ((v) => !v)}
              aria-label={showEQ ? "Hide equalizer" : "Show equalizer"}
              aria-expanded={showEQ}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                showEQ
                  ? "text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <AdjustmentsHorizontalIcon className="w-6 h-6" />
            </button>

            {/* Up Next toggle */}
            <button
              onClick={() => setShowUpNext((v) => !v)}
              aria-label={showUpNext ? "Hide Up Next" : "Show Up Next"}
              aria-expanded={showUpNext}
              className={`relative w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                showUpNext
                  ? "text-violet-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              <QueueListIcon className="w-6 h-6" />
              {queue.length - (currentIndex + 1) > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] px-0.5 bg-violet-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center leading-none">
                  {queue.length - (currentIndex + 1)}
                </span>
              )}
            </button>

            {/* Close */}
            <button
              onClick={clearQueue}
              aria-label="Close player"
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-300 transition-colors"
            >
              <XMarkIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
      </div>

      {/* Expanded player drawer */}
      <DrawerContent className="h-[100dvh] md:h-auto md:max-h-[90vh] md:max-w-[480px] md:mx-auto md:rounded-2xl">
        <DrawerHandle className="md:hidden" />
        <DrawerTitle className="sr-only">Now Playing</DrawerTitle>
        <ExpandedPlayer
          isFavorite={isFavorite}
          onToggleFavorite={handleToggleFavorite}
          reactions={reactions}
          onReact={handleReact}
          isAuthenticated={!!session?.user}
          onClose={() => setIsDrawerOpen(false)}
        />
      </DrawerContent>
    </div>
    </Drawer>
  );
}
