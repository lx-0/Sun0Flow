"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { PlayIcon, PauseIcon, MusicalNoteIcon, FlagIcon, ShareIcon, SparklesIcon } from "@heroicons/react/24/solid";
import dynamic from "next/dynamic";
import { useToast } from "@/components/Toast";
import { useSession } from "next-auth/react";
import type { ReactionItem } from "@/components/ReactionTimeline";

// Lazy-load below-fold and conditional components to reduce initial bundle
const ReportModal = dynamic(() => import("@/components/ReportModal").then((m) => m.ReportModal), { ssr: false });
const CommentsSection = dynamic(() => import("@/components/CommentsSection").then((m) => m.CommentsSection), { ssr: false });
const EmojiReactionPicker = dynamic(() => import("@/components/EmojiReactionPicker").then((m) => m.EmojiReactionPicker), { ssr: false });
const ReactionTimeline = dynamic(() => import("@/components/ReactionTimeline").then((m) => m.ReactionTimeline), { ssr: false });

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
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
  prompt: string | null;
  createdAt: string;
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
  prompt,
  createdAt,
}: PublicSongViewProps) {
  const signupReturnUrl = returnUrl ?? `/s/${slug}`;
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration ?? 0);
  const [reportOpen, setReportOpen] = useState(false);
  const [reactions, setReactions] = useState<ReactionItem[]>([]);
  const { data: session } = useSession();
  const { toast } = useToast();

  const handleShare = useCallback(async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title, url });
      } else {
        await navigator.clipboard.writeText(url);
        toast("Link copied to clipboard!", "success");
      }
    } catch {
      // Fallback: manual copy
      try {
        await navigator.clipboard.writeText(url);
        toast("Link copied to clipboard!", "success");
      } catch {
        toast("Could not copy link. Please copy the URL manually.", "error");
      }
    }
  }, [title, toast]);

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

  const pct = audioDuration > 0 ? (currentTime / audioDuration) * 100 : 0;

  return (
    <div className="w-full max-w-sm">
      {/* Hero cover art with blurred background */}
      <div className="relative w-full overflow-hidden rounded-b-3xl mb-6">
        {/* Blurred background layer */}
        {imageUrl && (
          <div className="absolute inset-0">
            <Image
              src={imageUrl}
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
            {imageUrl ? (
              <Image src={imageUrl} alt={title} fill className="object-cover" sizes="(max-width: 384px) 100vw, 384px" priority />
            ) : (
              <MusicalNoteIcon className="w-20 h-20 text-gray-300 dark:text-gray-700" />
            )}
          </div>

          {/* Song info */}
          <div className="text-center space-y-1.5">
            <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white">{title}</h1>
            {creatorName && (
              <p className="text-sm text-gray-500 dark:text-gray-400">by {creatorName}</p>
            )}
            {tags && (
              <p className="text-xs uppercase tracking-wider text-gray-500 dark:text-gray-400">{tags}</p>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500">
              {new Date(createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-6 px-4">
      {/* Prompt */}
      {prompt && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 transition-shadow duration-200 hover:shadow-md">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1">Prompt</h2>
          <p className="text-sm text-gray-700 dark:text-gray-300">{prompt}</p>
        </div>
      )}

      {/* Audio player */}
      {audioUrl && (
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

          {/* Seek bar + reaction timeline */}
          <div className="space-y-1">
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
                onChange={(e) => handleSeek(Number(e.target.value) / 100)}
                className="absolute left-0 right-0 top-1/2 -translate-y-1/2 w-full opacity-0 cursor-pointer min-h-[44px]"
                aria-label="Seek"
              />
            </div>
            {reactions.length > 0 && audioDuration > 0 && (
              <ReactionTimeline reactions={reactions} duration={audioDuration} />
            )}
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(audioDuration)}</span>
            </div>
          </div>

          {/* Emoji reaction picker or login prompt */}
          <div className="flex justify-center">
            {session?.user ? (
              <EmojiReactionPicker
                isPlaying={isPlaying}
                isAuthenticated={true}
                onReact={handleReact}
              />
            ) : (
              isPlaying && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  <a href="/auth/signin" className="underline hover:text-violet-500 transition-colors">
                    Log in
                  </a>{" "}
                  to react
                </p>
              )
            )}
          </div>

          <audio
            ref={audioRef}
            src={audioUrl}
            onPlay={() => setIsPlaying(true)}
            onPause={() => setIsPlaying(false)}
            onEnded={() => { setIsPlaying(false); setCurrentTime(0); }}
            onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime ?? 0)}
            onDurationChange={() => setAudioDuration(audioRef.current?.duration ?? 0)}
          />
        </div>
      )}

      {/* Share + Report buttons */}
      <div className="flex justify-center gap-2">
        <button
          onClick={handleShare}
          className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg text-gray-500 dark:text-gray-400 hover:text-violet-600 dark:hover:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-all duration-200 active:scale-95 min-h-[44px]"
          aria-label="Copy share link"
        >
          <ShareIcon className="w-3.5 h-3.5" aria-hidden="true" />
          Share
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

      {/* Comments */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4">
        <CommentsSection
          songId={songId}
          currentTime={currentTime}
          duration={audioDuration}
          onSeek={(seconds) => {
            if (audioRef.current && audioDuration > 0) {
              audioRef.current.currentTime = seconds;
            }
          }}
        />
      </div>

      {/* Branding */}
      <p className="text-center text-xs text-gray-500 dark:text-gray-400">
        Shared via SunoFlow
      </p>
      </div>
    </div>
  );
}
