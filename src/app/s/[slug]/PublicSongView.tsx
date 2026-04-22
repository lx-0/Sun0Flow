"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PlayIcon, PauseIcon, MusicalNoteIcon, FlagIcon, SparklesIcon, SpeakerWaveIcon, SpeakerXMarkIcon, CodeBracketIcon, HeartIcon } from "@heroicons/react/24/solid";
import { ChatBubbleLeftIcon, HeartIcon as HeartOutlineIcon } from "@heroicons/react/24/outline";
import dynamic from "next/dynamic";
import { useToast } from "@/components/Toast";
import { useSession } from "next-auth/react";
import { FollowButton } from "@/components/FollowButton";
import type { ReactionItem } from "@/components/ReactionTimeline";
import { track } from "@/lib/analytics";
import { RelatedSongs } from "@/components/RelatedSongs";
import { ShareMenu } from "@/components/ShareMenu";

// Lazy-load below-fold and conditional components to reduce initial bundle
const ReportModal = dynamic(() => import("@/components/ReportModal").then((m) => m.ReportModal), { ssr: false });
const CommentsSection = dynamic(() => import("@/components/CommentsSection").then((m) => m.CommentsSection), { ssr: false });
const EmojiReactionPicker = dynamic(() => import("@/components/EmojiReactionPicker").then((m) => m.EmojiReactionPicker), { ssr: false });
const ReactionTimeline = dynamic(() => import("@/components/ReactionTimeline").then((m) => m.ReactionTimeline), { ssr: false });
const PlayerWaveform = dynamic(() => import("@/components/PlayerWaveform").then((m) => m.PlayerWaveform), { ssr: false });

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export interface SerializedPublicVariant {
  id: string;
  title: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  tags: string | null;
  publicSlug: string | null;
  createdAt: string;
}

interface PublicSongViewProps {
  songId: string;
  slug: string;
  /** Optional override for the returnUrl used in the signup CTA. Defaults to /s/{slug}. */
  returnUrl?: string;
  title: string;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  tags: string | null;
  creatorName: string | null;
  creatorUsername?: string | null;
  songOwnerId?: string | null;
  prompt: string | null;
  lyrics: string | null;
  createdAt: string;
  variants?: SerializedPublicVariant[];
}

export function PublicSongView({
  songId,
  slug,
  returnUrl,
  title,
  imageUrl,
  audioUrl,
  duration,
  tags,
  creatorName,
  creatorUsername,
  songOwnerId,
  prompt,
  lyrics,
  createdAt,
  variants = [],
}: PublicSongViewProps) {
  const signupReturnUrl = returnUrl ?? `/s/${slug}`;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration ?? 0);
  const [reportOpen, setReportOpen] = useState(false);
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedTheme, setEmbedTheme] = useState<"dark" | "light">("dark");
  const [embedWidth, setEmbedWidth] = useState("100%");
  const [embedCopied, setEmbedCopied] = useState(false);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const { data: session } = useSession();
  const { toast } = useToast();
  const [isFavorite, setIsFavorite] = useState(false);

  const [activeSongId, setActiveSongId] = useState(songId);
  const [activeTitle, setActiveTitle] = useState(title);
  const [activeImageUrl, setActiveImageUrl] = useState(imageUrl);
  const [activeAudioUrl, setActiveAudioUrl] = useState(audioUrl);
  const [, setActiveDuration] = useState(duration);
  const [activeTags, setActiveTags] = useState(tags);

  const showVariants = variants.length > 1;

  const handleVariantSwitch = useCallback(
    (variant: SerializedPublicVariant) => {
      if (variant.id === activeSongId) return;

      if (audioRef.current) {
        audioRef.current.pause();
        setIsPlaying(false);
      }

      setActiveSongId(variant.id);
      setActiveTitle(variant.title ?? "Untitled");
      setActiveImageUrl(variant.imageUrl);
      setActiveAudioUrl(variant.audioUrl);
      setActiveDuration(variant.duration);
      setActiveTags(variant.tags);
      setCurrentTime(0);
      setAudioDuration(variant.duration ?? 0);

      shownReactionIdsRef.current = new Set();
      shownCommentIdsRef.current = new Set();
      setActivePopups([]);
      setActiveCommentPopups([]);

      if (variant.publicSlug) {
        window.history.replaceState(null, "", `/s/${variant.publicSlug}`);
      }
    },
    [activeSongId]
  );

  useEffect(() => {
    if (!songId || !session?.user) {
      setIsFavorite(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/songs/${songId}/favorite`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setIsFavorite(data.isFavorite ?? false);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [songId, session?.user]);

  async function handleToggleFavorite() {
    if (!session?.user) return;
    const prev = isFavorite;
    const newFav = !prev;
    setIsFavorite(newFav);
    try {
      const res = await fetch(`/api/songs/${songId}/favorite`, {
        method: newFav ? "POST" : "DELETE",
      });
      if (!res.ok) {
        setIsFavorite(prev);
      }
    } catch {
      setIsFavorite(prev);
    }
  }

  // Timestamped comments — for waveform markers and playback popups
  interface TimestampedComment { id: string; timestamp: number; body: string; username: string | null; }
  const [timedComments, setTimedComments] = useState<TimestampedComment[]>([]);
  interface CommentPopup { id: string; body: string; username: string | null; key: number; leftPct: number; }
  const [activeCommentPopups, setActiveCommentPopups] = useState<CommentPopup[]>([]);
  const shownCommentIdsRef = useRef<Set<string>>(new Set());
  const commentPopupKeyRef = useRef(0);

  // Emoji popup state — floats up from waveform when currentTime passes a reaction
  interface EmojiPopup { id: string; emoji: string; key: number; leftPct: number; }
  const [activePopups, setActivePopups] = useState<EmojiPopup[]>([]);
  const shownReactionIdsRef = useRef<Set<string>>(new Set());
  const popupKeyRef = useRef(0);


  function getEmbedCode() {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://sunoflow.app";
    const src = `${origin}/embed/${songId}?theme=${embedTheme}`;
    const widthAttr = embedWidth === "100%" ? `width="100%"` : `width="${embedWidth}"`;
    return `<iframe src="${src}" ${widthAttr} height="96" style="border:none;border-radius:12px;overflow:hidden;" allow="autoplay" title="${title} — SunoFlow"></iframe>`;
  }

  async function handleCopyEmbed() {
    try {
      await navigator.clipboard.writeText(getEmbedCode());
      setEmbedCopied(true);
      setTimeout(() => setEmbedCopied(false), 2000);
    } catch {
      toast("Could not copy embed code.", "error");
    }
  }

  // Reload audio element when the source URL changes (variant switch)
  useEffect(() => {
    if (audioRef.current && activeAudioUrl) {
      audioRef.current.load();
    }
  }, [activeAudioUrl]);

  // Track public song page view on mount (PostHog + DB)
  useEffect(() => {
    track("public_song_viewed", { songId, slug });
    fetch("/api/analytics/view", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ songId }),
    }).catch(() => {});
  }, [songId, slug]);

  // Fetch all reactions on mount (no auth needed for public songs)
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/songs/${songId}/reactions`)
      .then((res) => res.ok ? res.json() : null)
      .then((data) => {
        if (!cancelled && data?.reactions) setReactions(data.reactions);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [songId]);

  // Fetch timestamped comments on mount
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/songs/${songId}/comments?page=1`)
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songId]);

  // Trigger comment popups as currentTime passes comment timestamps during playback
  useEffect(() => {
    if (!isPlaying || timedComments.length === 0 || audioDuration <= 0) return;
    const newlyTriggered = timedComments.filter(
      (c) => c.timestamp <= currentTime && !shownCommentIdsRef.current.has(c.id)
    );
    if (newlyTriggered.length === 0) return;
    for (const c of newlyTriggered) {
      shownCommentIdsRef.current.add(c.id);
    }
    const newPopups: CommentPopup[] = newlyTriggered.map((c) => {
      const key = ++commentPopupKeyRef.current;
      const leftPct = Math.min(95, Math.max(5, (c.timestamp / audioDuration) * 100));
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

  // Trigger emoji popups as currentTime passes reaction timestamps
  useEffect(() => {
    if (!isPlaying || reactions.length === 0 || audioDuration <= 0) return;
    const newlyTriggered = reactions.filter(
      (r) => r.timestamp <= currentTime && !shownReactionIdsRef.current.has(r.id)
    );
    if (newlyTriggered.length === 0) return;
    for (const r of newlyTriggered) {
      shownReactionIdsRef.current.add(r.id);
    }
    const newPopups: EmojiPopup[] = newlyTriggered.map((r) => {
      const key = ++popupKeyRef.current;
      const leftPct = Math.min(98, Math.max(2, (r.timestamp / audioDuration) * 100));
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

  const handleReact = useCallback(
    async (emoji: string) => {
      const timestamp = Math.max(0, Math.min(currentTime, audioDuration || currentTime));

      const optimistic: ReactionItem = {
        id: `optimistic-${Date.now()}`,
        emoji,
        timestamp,
        userId: session?.user?.id ?? "",
        username: session?.user?.name ?? undefined,
      };
      setReactions((prev) => [...prev, optimistic]);

      try {
        const res = await fetch(`/api/songs/${songId}/reactions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ emoji, timestamp }),
        });

        if (res.status === 429) {
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
        setReactions((prev) =>
          prev.map((r) =>
            r.id === optimistic.id
              ? { ...created, username: session?.user?.name ?? undefined }
              : r
          )
        );
      } catch {
        setReactions((prev) => prev.filter((r) => r.id !== optimistic.id));
        toast("Couldn't save reaction. Try again.", "error");
      }
    },
    [songId, currentTime, audioDuration, session, toast]
  );

  function handleVolumeChange(value: number) {
    setVolume(value);
    setMuted(value === 0);
    if (audioRef.current) {
      audioRef.current.volume = value;
      audioRef.current.muted = value === 0;
    }
  }

  function handleToggleMute() {
    const nextMuted = !muted;
    setMuted(nextMuted);
    if (audioRef.current) {
      audioRef.current.muted = nextMuted;
    }
  }

  function handleTogglePlay() {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play().catch(console.error);
    }
  }

  function handleSeek(pct: number) {
    if (!audioRef.current || audioDuration <= 0) return;
    audioRef.current.currentTime = pct * audioDuration;
  }

  return (
    <div className="w-full max-w-sm md:max-w-4xl">
      <div className="md:grid md:grid-cols-[2fr_3fr] md:gap-8 md:items-start">
      {/* Left column: cover art */}
      <div className="md:sticky md:top-8">
      <div className="relative w-full overflow-hidden rounded-b-3xl md:rounded-3xl mb-6 md:mb-0">
        {/* Blurred background layer */}
        {activeImageUrl && (
          <div className="absolute inset-0">
            <Image
              src={activeImageUrl}
              alt=""
              fill
              className="object-cover scale-110 blur-2xl opacity-60"
              sizes="100vw"
              aria-hidden="true"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-gray-50/30 via-gray-50/50 to-gray-50 dark:from-gray-950/30 dark:via-gray-950/50 dark:to-gray-950" />
          </div>
        )}

        <div className="relative px-4 pt-4 pb-6 space-y-4">
          {/* Cover art */}
          <div className="relative aspect-square w-full rounded-2xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 overflow-hidden flex items-center justify-center shadow-xl ring-1 ring-black/5 dark:ring-white/10">
            {activeImageUrl ? (
              <Image src={activeImageUrl} alt={activeTitle} fill className="object-cover" sizes="(max-width: 768px) 100vw, 400px" priority />
            ) : (
              <MusicalNoteIcon className="w-20 h-20 text-gray-300 dark:text-gray-700" />
            )}
          </div>

          {/* Song info */}
          <div className="text-center md:text-left space-y-1.5">
            <h1 className="text-2xl md:text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">{activeTitle}</h1>
            {creatorName && (
              <div className="flex items-center justify-center md:justify-start gap-2 flex-wrap">
                {creatorUsername ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400">
                    by{" "}
                    <Link href={`/u/${creatorUsername}`} className="hover:text-violet-500 dark:hover:text-violet-400 transition-colors">
                      {creatorName}
                    </Link>
                  </p>
                ) : (
                  <p className="text-sm text-gray-500 dark:text-gray-400">by {creatorName}</p>
                )}
                {songOwnerId && (
                  <FollowButton userId={songOwnerId} />
                )}
              </div>
            )}
            {activeTags && (
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">{activeTags}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
      </div>
      </div>

      {/* Right column: content */}
      <div className="space-y-6 px-4 md:px-0 md:pt-4">
      {/* Prompt */}
      {prompt && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 transition-shadow duration-200 hover:shadow-md">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Prompt</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">{prompt}</p>
        </div>
      )}

      {/* Lyrics */}
      {lyrics && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 transition-shadow duration-200 hover:shadow-md">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Lyrics</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-line">{lyrics}</p>
        </div>
      )}

      {/* Audio player */}
      {activeAudioUrl && (
        <div className="space-y-3">
          {/* Play button */}
          <div className="flex justify-center">
            <button
              onClick={handleTogglePlay}
              className="w-14 h-14 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center transition-colors"
              aria-label={isPlaying ? "Pause" : "Play"}
            >
              {isPlaying ? (
                <PauseIcon className="w-7 h-7" />
              ) : (
                <PlayIcon className="w-7 h-7 ml-0.5" />
              )}
            </button>
          </div>

          {/* Waveform + reaction timeline + floating popups */}
          <div className="relative space-y-1">
            {/* Floating emoji popups */}
            {activePopups.length > 0 && (
              <div className="pointer-events-none absolute inset-x-2 bottom-8 h-0 z-10">
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

            {/* Floating comment popups */}
            {activeCommentPopups.length > 0 && (
              <div className="pointer-events-none absolute inset-x-2 bottom-8 h-0 z-20">
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

            <div className="relative h-14 bg-gray-100 dark:bg-gray-800 rounded-xl overflow-hidden px-2 pt-1 pb-0.5">
              <PlayerWaveform
                songId={songId}
                currentTime={currentTime}
                duration={audioDuration}
                isBuffering={false}
                onSeek={handleSeek}
                reactionTimestamps={reactions.map((r) => r.timestamp)}
                commentTimestamps={timedComments.map((c) => c.timestamp)}
              />
              {reactions.length > 0 && audioDuration > 0 && (
                <div className="absolute inset-x-2 top-0 bottom-0 pointer-events-none">
                  <div className="pointer-events-auto">
                    <ReactionTimeline reactions={reactions} duration={audioDuration} />
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(audioDuration)}</span>
            </div>
          </div>

          {/* Volume control */}
          <div className="flex items-center gap-2">
            <button
              onClick={handleToggleMute}
              className="text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 transition-colors flex-shrink-0"
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted || volume === 0 ? (
                <SpeakerXMarkIcon className="w-4 h-4" aria-hidden="true" />
              ) : (
                <SpeakerWaveIcon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={muted ? 0 : volume}
              onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
              className="flex-1 h-1.5 accent-violet-500 cursor-pointer"
              aria-label="Volume"
            />
          </div>

          {/* Emoji reaction picker or login prompt */}
          <div className="flex justify-center">
            {session?.user ? (
              <EmojiReactionPicker
                isPlaying={isPlaying}
                isAuthenticated={true}
                onReact={handleReact}
                reactionEmojis={reactions.map((r) => r.emoji)}
              />
            ) : (
              isPlaying && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  <Link href="/auth/signin" className="underline hover:text-violet-500 transition-colors">
                    Log in
                  </Link>{" "}
                  to react
                </p>
              )
            )}
          </div>

          <audio
            ref={audioRef}
            src={activeAudioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); setCurrentTime(0); shownReactionIdsRef.current = new Set(); shownCommentIdsRef.current = new Set(); setActivePopups([]); setActiveCommentPopups([]); }}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onDurationChange={() => setAudioDuration(audioRef.current?.duration ?? 0)}
          />
        </div>
      )}

      {/* Favorite + Share + Embed + Report buttons */}
      <div className="flex justify-center gap-2 flex-wrap">
        {session?.user ? (
          <button
            onClick={handleToggleFavorite}
            aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
            className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 active:scale-95 min-h-[44px] ${
              isFavorite
                ? "text-pink-500 hover:bg-pink-50 dark:hover:bg-pink-900/20"
                : "text-gray-500 dark:text-gray-400 hover:text-pink-500 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20"
            }`}
          >
            {isFavorite ? (
              <HeartIcon className="w-4 h-4" aria-hidden="true" />
            ) : (
              <HeartOutlineIcon className="w-4 h-4" aria-hidden="true" />
            )}
            Favorite
          </button>
        ) : (
          <Link
            href="/auth/signin"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:text-pink-500 dark:hover:text-pink-400 hover:bg-pink-50 dark:hover:bg-pink-900/20 transition-all duration-200 active:scale-95 min-h-[44px]"
            aria-label="Log in to favorite"
          >
            <HeartOutlineIcon className="w-4 h-4" aria-hidden="true" />
            Favorite
          </Link>
        )}
        <ShareMenu
          url={typeof window !== "undefined" ? window.location.href : `/s/${slug}`}
          title={title}
          text={`${title} — listen on SunoFlow`}
          source="public_song"
          embedUrl={`/embed/${songId}`}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 active:scale-95 min-h-[44px]"
        />
        <button
          onClick={() => setEmbedOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 active:scale-95 min-h-[44px]"
          aria-label="Get embed code"
        >
          <CodeBracketIcon className="w-3.5 h-3.5" aria-hidden="true" />
          Embed
        </button>
        <button
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-gray-400 dark:text-gray-500 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200 active:scale-95 min-h-[44px]"
          aria-label="Report song"
        >
          <FlagIcon className="w-3.5 h-3.5" aria-hidden="true" />
          Report
        </button>
      </div>

      {/* Embed modal */}
      {embedOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Embed player"
          onClick={(e) => { if (e.target === e.currentTarget) setEmbedOpen(false); }}
        >
          <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <CodeBracketIcon className="w-4 h-4 text-violet-500" />
                Embed player
              </h2>
              <button
                onClick={() => setEmbedOpen(false)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            {/* Options */}
            <div className="flex gap-4 text-xs">
              <div className="space-y-1">
                <p className="text-gray-500 dark:text-gray-400 font-medium">Theme</p>
                <div className="flex gap-1.5">
                  {(["dark", "light"] as const).map((t) => (
                    <button
                      key={t}
                      onClick={() => setEmbedTheme(t)}
                      className={`px-2.5 py-1 rounded-md border capitalize transition-colors ${embedTheme === t ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400"}`}
                    >
                      {t}
                    </button>
                  ))}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500 dark:text-gray-400 font-medium">Width</p>
                <div className="flex gap-1.5">
                  {["100%", "480px", "320px"].map((w) => (
                    <button
                      key={w}
                      onClick={() => setEmbedWidth(w)}
                      className={`px-2.5 py-1 rounded-md border transition-colors ${embedWidth === w ? "border-violet-500 bg-violet-50 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400" : "border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 hover:border-gray-400"}`}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Preview */}
            <div className="rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700">
              <iframe
                src={`/embed/${songId}?theme=${embedTheme}`}
                width="100%"
                height="96"
                style={{ border: "none", display: "block" }}
                title={`${title} — SunoFlow`}
              />
            </div>

            {/* Code */}
            <div className="relative">
              <textarea
                readOnly
                rows={3}
                aria-label="Embed code"
                value={getEmbedCode()}
                className="w-full text-xs font-mono bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 resize-none text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-violet-500"
                onClick={(e) => (e.target as HTMLTextAreaElement).select()}
              />
            </div>

            <button
              onClick={handleCopyEmbed}
              className="w-full py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
            >
              {embedCopied ? "Copied!" : "Copy embed code"}
            </button>
          </div>
        </div>
      )}

      {/* Generate CTA for unauthenticated visitors */}
      {!session?.user && (
        <div className="bg-gradient-to-br from-violet-50 to-violet-100 dark:from-violet-950/30 dark:to-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-xl p-4 text-center space-y-3">
          <div className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-violet-100 dark:bg-violet-900/40">
            <SparklesIcon className="w-5 h-5 text-violet-600 dark:text-violet-400" aria-hidden="true" />
          </div>
          <div>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">Love this song?</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Generate something like it — free to try.</p>
          </div>
          <Link
            href={`/register?returnUrl=${encodeURIComponent(signupReturnUrl)}`}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-lg transition-colors"
          >
            <SparklesIcon className="w-4 h-4" aria-hidden="true" />
            Create your own music
          </Link>
        </div>
      )}

      {/* Report modal */}
      {reportOpen && (
        <ReportModal
          songId={songId}
          songTitle={title}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Variations */}
      {showVariants && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">
            Variations ({variants.length})
          </h2>
          <div className="space-y-2">
            {variants.map((v) => {
              const isActive = v.id === activeSongId;
              return (
                <button
                  key={v.id}
                  onClick={() => handleVariantSwitch(v)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border transition-colors text-left ${
                    isActive
                      ? "border-violet-400 bg-violet-50 dark:bg-violet-900/20"
                      : "border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-600"
                  }`}
                >
                  <div className="relative w-10 h-10 rounded-lg bg-gray-100 dark:bg-gray-800 overflow-hidden flex-shrink-0">
                    {v.imageUrl ? (
                      <Image src={v.imageUrl} alt={v.title ?? "Variant"} fill className="object-cover" sizes="40px" />
                    ) : (
                      <MusicalNoteIcon className="w-5 h-5 text-gray-400 dark:text-gray-600 absolute inset-0 m-auto" />
                    )}
                    {!isActive && (
                      <div className="absolute inset-0 flex items-center justify-center bg-black/30 opacity-0 hover:opacity-100 transition-opacity">
                        <PlayIcon className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-gray-900 dark:text-white block truncate">
                      {v.title || "Untitled variation"}
                    </span>
                    <div className="flex items-center gap-2 mt-0.5">
                      {v.duration != null && (
                        <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(v.duration)}</span>
                      )}
                      {v.tags && (
                        <span className="text-xs text-gray-400 dark:text-gray-500 truncate">{v.tags}</span>
                      )}
                    </div>
                  </div>
                  {isActive && (
                    <span className="flex-shrink-0 text-xs font-medium text-violet-600 dark:text-violet-400 px-2 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/40">
                      Playing
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Comments */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <CommentsSection
          songId={songId}
          songOwnerId={songOwnerId ?? undefined}
          currentTime={currentTime}
          duration={audioDuration}
          onSeek={(seconds) => {
            if (audioRef.current && audioDuration > 0) {
              audioRef.current.currentTime = seconds;
            }
          }}
        />
      </div>

      {/* Related songs */}
      <RelatedSongs songId={songId} />

      {/* Branding */}
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        Shared via SunoFlow
      </p>
      </div>
      </div>
    </div>
  );
}
