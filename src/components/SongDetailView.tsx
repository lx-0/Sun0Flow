"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { canUseFeature, type SubscriptionTier } from "@/lib/feature-gates";
import { track } from "@/lib/analytics";
import {
  ArrowLeftIcon,
  MusicalNoteIcon,
  ArrowDownTrayIcon,
  HeartIcon,
  ArrowPathIcon,
  ForwardIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  ScissorsIcon,
  PaintBrushIcon,
  FilmIcon,
  PlayIcon,
  PauseIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/solid";
import { HeartIcon as HeartOutlineIcon, HandThumbUpIcon as HandThumbUpOutlineIcon, HandThumbDownIcon as HandThumbDownOutlineIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import { useSongStems } from "@/hooks/useSongStems";
import type { SunoSong } from "@/lib/sunoapi";
import { getRating, type SongRating } from "@/lib/ratings";
import { useToast } from "./Toast";
import { useQueue } from "./QueueContext";
import { StarPicker } from "./StarPicker";
import { StemsPlayer } from "./StemsPlayer";
import { SeparateVocalsModal } from "./SeparateVocalsModal";
import { type RemixAction } from "./RemixModal";
const EmbedCodeModal = dynamic(() => import("./EmbedCodeModal").then((m) => m.EmbedCodeModal), { ssr: false });
const CreateVariationModal = dynamic(() => import("./CreateVariationModal").then((m) => m.CreateVariationModal), { ssr: false });
const RemixModal = dynamic(() => import("./RemixModal").then((m) => m.RemixModal), { ssr: false });
const ReportModal = dynamic(() => import("./ReportModal").then((m) => m.ReportModal), { ssr: false });
const SectionEditor = dynamic(() => import("./SectionEditor").then((m) => m.SectionEditor), { ssr: false });
const CoverArtModal = dynamic(() => import("./CoverArtModal").then((m) => m.CoverArtModal), { ssr: false });
const RecommendationSection = dynamic(() => import("./SongRecommendations").then((m) => m.RecommendationSection), { ssr: false });
import { TagInput } from "./TagInput";
import { CoverArtImage } from "./CoverArtImage";
import { generateCoverArtVariants } from "@/lib/cover-art-generator";
import { SongMetadataCard } from "./SongMetadataCard";
import { SongActionsBar } from "./SongActionsBar";
import { SongLyricsSection } from "./SongLyricsSection";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SongTag {
  id: string;
  name: string;
  color: string;
}

interface VariationSummary {
  id: string;
  title: string | null;
  prompt: string | null;
  tags: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
  lyrics: string | null;
  generationStatus: string;
  isInstrumental: boolean;
  createdAt: string | Date;
}

interface SongDetailViewProps {
  song: SunoSong;
  isFavorite?: boolean;
  favoriteCount?: number;
  sunoJobId?: string | null;
  isPublic?: boolean;
  publicSlug?: string | null;
  isHidden?: boolean;
  isInstrumental?: boolean;
  initialRating?: number | null;
  initialRatingNote?: string | null;
  songTags?: SongTag[];
  variations?: VariationSummary[];
  variationCount?: number;
  maxVariations?: number;
  parentSongId?: string | null;
  parentSongTitle?: string | null;
  lyricsEdited?: string | null;
}

// ─── Main SongDetailView ──────────────────────────────────────────────────────

export function SongDetailView({
  song,
  isFavorite: initialFavorite = false,
  favoriteCount: initialFavoriteCount = 0,
  sunoJobId,
  isPublic: initialIsPublic = false,
  publicSlug: initialPublicSlug = null,
  isHidden = false,
  isInstrumental = false,
  initialRating = null,
  initialRatingNote = null,
  songTags: initialSongTags = [],
  variations: initialVariations = [],
  variationCount: initialVariationCount = 0,
  maxVariations = 5,
  parentSongId = null,
  parentSongTitle = null,
  lyricsEdited = null,
}: SongDetailViewProps) {
  const router = useRouter();
  const { data: session } = useSession();
  const userTier = ((session?.user as unknown as Record<string, unknown>)?.subscriptionTier as SubscriptionTier) ?? "free";
  const canSeparateVocals = canUseFeature("vocalSeparation", userTier);
  const { toast } = useToast();
  const { cachedIds, saving: offlineSaving, saveOffline, removeOffline } = useOfflineCache();
  const isCached = cachedIds.has(song.id);
  const isSavingOffline = offlineSaving.has(song.id);
  const { playNext, addToQueue, togglePlay, isPlaying, currentIndex, queue } = useQueue();
  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;
  const isThisSongPlaying = isPlaying && currentSong?.id === song.id;

  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [favoriteCount, setFavoriteCount] = useState(initialFavoriteCount);

  // Variation state
  const [variationModalOpen, setVariationModalOpen] = useState(false);
  const [creatingVariation, setCreatingVariation] = useState(false);
  const [compareVariation, setCompareVariation] = useState<VariationSummary | null>(null);
  const [remixAction, setRemixAction] = useState<RemixAction | null>(null);
  const [remixSubmitting, setRemixSubmitting] = useState(false);

  const [rating, setRatingState] = useState<SongRating>({
    stars: initialRating ?? 0,
    note: initialRatingNote ?? "",
  });
  const [saved, setSaved] = useState(false);
  const [savingRating, setSavingRating] = useState(false);
  const [noteDraft, setNoteDraft] = useState(initialRatingNote ?? "");

  // Generation feedback (thumbs up/down)
  type ThumbsRating = "thumbs_up" | "thumbs_down" | null;
  const [thumbsRating, setThumbsRating] = useState<ThumbsRating>(null);
  const [savingThumbs, setSavingThumbs] = useState(false);

  // Share / visibility state
  const [isPublic, setIsPublic] = useState(initialIsPublic);
  const [publicSlug, setPublicSlug] = useState(initialPublicSlug);
  const [sharing, setSharing] = useState(false);
  const [confirmPublicOpen, setConfirmPublicOpen] = useState(false);

  // Report modal
  const [reportOpen, setReportOpen] = useState(false);

  // Appeal state
  const [appealOpen, setAppealOpen] = useState(false);
  const [appealReason, setAppealReason] = useState("");
  const [appealSubmitting, setAppealSubmitting] = useState(false);
  const [appealStatus, setAppealStatus] = useState<"none" | "pending" | "approved" | "rejected">("none");

  const handleSubmitAppeal = async () => {
    if (appealReason.trim().length < 10) return;
    setAppealSubmitting(true);
    try {
      const res = await fetch("/api/appeals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songId: song.id, reason: appealReason.trim() }),
      });
      if (res.status === 409) {
        setAppealStatus("pending");
        setAppealOpen(false);
        toast("You already have a pending appeal for this song.");
        return;
      }
      if (res.ok) {
        setAppealStatus("pending");
        setAppealOpen(false);
        toast("Appeal submitted. We'll review it shortly.");
      } else {
        const data = await res.json().catch(() => ({}));
        toast(data.error || "Failed to submit appeal. Please try again.");
      }
    } catch {
      toast("Failed to submit appeal. Please try again.");
    } finally {
      setAppealSubmitting(false);
    }
  };

  // Embed code modal
  const [embedOpen, setEmbedOpen] = useState(false);
  const [embedTheme, setEmbedTheme] = useState<"dark" | "light">("dark");
  const [embedAutoplay, setEmbedAutoplay] = useState(false);

  // Vocal separation — delegated to useSongStems hook
  const stemHook = useSongStems({ songId: song.id, songTitle: song.title, toast });

  // Section editor state
  const [sectionEditorOpen, setSectionEditorOpen] = useState(false);

  // Cover art state
  const [coverArtModalOpen, setCoverArtModalOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(song.imageUrl ?? null);
  const generatedFallbackUrl = generateCoverArtVariants({ songId: song.id, title: song.title, tags: song.tags })[0].dataUrl;

  // Export/conversion state
  type ExportFormat = "wav" | "midi" | "mp4";
  type ExportStatus = "idle" | "converting" | "done" | "error";
  const [exports, setExports] = useState<Record<ExportFormat, { status: ExportStatus; taskId?: string; error?: string }>>({
    wav: { status: "idle" },
    midi: { status: "idle" },
    mp4: { status: "idle" },
  });

  // Music video state
  type VideoStatus = "idle" | "polling" | "ready" | "error";
  const [videoUrl, setVideoUrl] = useState<string | null>(song.videoUrl ?? null);
  const [videoStatus, setVideoStatus] = useState<VideoStatus>(song.videoUrl ? "ready" : "idle");
  const [videoError, setVideoError] = useState<string | null>(null);
  const videoPollRef = useRef<NodeJS.Timeout | null>(null);

  const hasAudio = Boolean(song.audioUrl);

  // Fallback: load from backend Rating model if no DB rating on Song
  useEffect(() => {
    if (initialRating) return;
    let cancelled = false;
    getRating(song.id).then((existing) => {
      if (cancelled || !existing) return;
      setRatingState(existing);
      setNoteDraft(existing.note);
    });
    return () => { cancelled = true; };
  }, [song.id, initialRating]);

  // Load existing thumbs feedback
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/songs/${song.id}/feedback`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (cancelled || !data?.rating) return;
        setThumbsRating(data.rating);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [song.id]);

  async function handleThumbsFeedback(value: "thumbs_up" | "thumbs_down") {
    if (savingThumbs) return;
    setSavingThumbs(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating: value }),
      });
      if (res.ok) setThumbsRating(value);
    } catch {
      toast("Failed to save feedback", "error");
    } finally {
      setSavingThumbs(false);
    }
  }

  function handleStarChange(stars: number) {
    setRatingState((r) => ({ ...r, stars }));
    setSaved(false);
  }


  async function handleSaveRating() {
    if (rating.stars === 0 || savingRating) return;
    const r: SongRating = { stars: rating.stars, note: noteDraft.trim() };
    setSavingRating(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/rating`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stars: r.stars, note: r.note }),
      });
      if (!res.ok) throw new Error("Failed to save rating");
      setRatingState(r);
      setSaved(true);
    } catch {
      toast("Failed to save rating", "error");
    } finally {
      setSavingRating(false);
    }
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

  async function setVisibility(visibility: "public" | "private") {
    setSharing(true);
    try {
      const res = await fetch(`/api/songs/${song.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visibility }),
      });
      if (!res.ok) {
        toast("Failed to update visibility", "error");
        return;
      }
      const data = await res.json();
      setIsPublic(data.isPublic);
      setPublicSlug(data.publicSlug);

      if (data.isPublic && data.publicSlug) {
        const url = `${window.location.origin}/s/${data.publicSlug}`;
        await navigator.clipboard.writeText(url);
        toast("Public link copied to clipboard", "success");
        track("song_shared", { songId: song.id, source: "song_detail" });
      } else {
        toast("Song is now private", "success");
      }
    } catch {
      toast("Failed to update visibility", "error");
    } finally {
      setSharing(false);
    }
  }

  function handleVisibilityToggle() {
    if (!isPublic) {
      setConfirmPublicOpen(true);
    } else {
      setVisibility("private");
    }
  }

  async function handleCopyLink() {
    if (!publicSlug) return;
    const url = `${window.location.origin}/s/${publicSlug}`;

    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: song.title ?? "Check out this song", url });
        track("song_shared", { songId: song.id, source: "song_detail", method: "web_share_api" });
        return;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    await navigator.clipboard.writeText(url);
    toast("Link copied!", "success");
    track("song_link_copied", { songId: song.id, source: "song_detail" });
  }

  function handleShareOnX() {
    if (!publicSlug) return;
    const url = `${window.location.origin}/s/${publicSlug}`;
    const songTitle = song.title ?? "Check out this song";
    const tweetText = `${songTitle} — listen on SunoFlow`;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(url)}`;
    window.open(twitterUrl, "_blank", "noopener,noreferrer");
    track("song_shared", { songId: song.id, source: "song_detail", method: "twitter" });
  }

  async function handleCreateVariation(data: { prompt: string; tags: string; lyrics: string; title: string; makeInstrumental: boolean }) {
    if (creatingVariation) return;
    if (initialVariationCount >= maxVariations) {
      toast(`Maximum ${maxVariations} variations reached`, "error");
      return;
    }
    setCreatingVariation(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/variations`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: data.prompt || undefined,
          tags: data.tags || undefined,
          title: data.title || undefined,
          makeInstrumental: data.makeInstrumental,
        }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast(result.error ?? "Failed to create variation", "error");
        return;
      }
      toast("Variation generation started!", "success");
      setVariationModalOpen(false);
      router.push(`/library/${result.song.id}`);
    } catch {
      toast("Failed to create variation", "error");
    } finally {
      setCreatingVariation(false);
    }
  }

  async function handleRemixSubmit(action: RemixAction, data: Record<string, string | number | undefined>) {
    if (remixSubmitting) return;
    if (initialVariationCount >= maxVariations) {
      toast(`Maximum ${maxVariations} variations reached`, "error");
      return;
    }
    setRemixSubmitting(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const result = await res.json();
      if (!res.ok) {
        toast(result.error ?? "Generation failed", "error");
        return;
      }
      toast("Generation started!", "success");
      setRemixAction(null);
      router.push(`/library/${result.song.id}`);
    } catch {
      toast("Generation failed", "error");
    } finally {
      setRemixSubmitting(false);
    }
  }

  function startVideoPolling(taskId: string) {
    if (videoPollRef.current) clearInterval(videoPollRef.current);
    setVideoStatus("polling");
    setVideoError(null);

    const poll = async () => {
      try {
        const res = await fetch(`/api/songs/${song.id}/music-video/status?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json();
        if (!res.ok) {
          if (videoPollRef.current) clearInterval(videoPollRef.current);
          videoPollRef.current = null;
          setVideoStatus("error");
          setVideoError(data.error ?? "Failed to check video status");
          return;
        }
        if (data.status === "SUCCESS" && data.videoUrl) {
          if (videoPollRef.current) clearInterval(videoPollRef.current);
          videoPollRef.current = null;
          setVideoUrl(data.videoUrl);
          setVideoStatus("ready");
          toast("Music video is ready!", "success");
        } else if (data.status === "CREATE_TASK_FAILED" || data.status === "GENERATE_MP4_FAILED" || data.status === "CALLBACK_EXCEPTION") {
          if (videoPollRef.current) clearInterval(videoPollRef.current);
          videoPollRef.current = null;
          setVideoStatus("error");
          setVideoError(data.errorMessage ?? "Video generation failed");
          toast("Music video generation failed", "error");
        }
      } catch {
        if (videoPollRef.current) clearInterval(videoPollRef.current);
        videoPollRef.current = null;
        setVideoStatus("error");
        setVideoError("Network error while checking video status");
      }
    };

    poll();
    videoPollRef.current = setInterval(poll, 7000);
  }

  useEffect(() => {
    return () => {
      if (videoPollRef.current) clearInterval(videoPollRef.current);
    };
  }, []);

  async function handleExport(format: ExportFormat) {
    if (exports[format].status === "converting") return;
    setExports((prev) => ({ ...prev, [format]: { status: "converting" } }));

    const endpoints: Record<ExportFormat, string> = {
      wav: `/api/songs/${song.id}/convert-wav`,
      midi: `/api/songs/${song.id}/generate-midi`,
      mp4: `/api/songs/${song.id}/music-video`,
    };

    const labels: Record<ExportFormat, string> = {
      wav: "WAV conversion",
      midi: "MIDI extraction",
      mp4: "Music video generation",
    };

    try {
      const res = await fetch(endpoints[format], { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setExports((prev) => ({ ...prev, [format]: { status: "error", error: data.error } }));
        toast(data.error ?? `${labels[format]} failed`, "error");
        return;
      }
      setExports((prev) => ({ ...prev, [format]: { status: "done", taskId: data.taskId } }));
      if (format === "mp4" && data.taskId) {
        startVideoPolling(data.taskId);
      } else {
        toast(`${labels[format]} started! Task ID: ${data.taskId}`, "success");
      }
    } catch {
      setExports((prev) => ({ ...prev, [format]: { status: "error", error: `${labels[format]} failed` } }));
      toast(`${labels[format]} failed`, "error");
    }
  }

  return (
    <div className="max-w-2xl mx-auto">
      {/* Hero cover art with blurred background */}
      <div className="relative w-full overflow-hidden rounded-b-3xl mb-6">
        {/* Blurred background layer */}
        {(coverImageUrl || generatedFallbackUrl) && (
          <div className="absolute inset-0">
            <CoverArtImage
              src={coverImageUrl || generatedFallbackUrl}
              alt=""
              fill
              className="object-cover scale-110 blur-2xl opacity-60"
              sizes="100vw"
              priority
              fallbackSrc={generatedFallbackUrl}
              songId={song.id}
            />
            <div className="absolute inset-0 bg-gradient-to-b from-gray-50/30 via-gray-50/50 to-gray-50 dark:from-gray-950/30 dark:via-gray-950/50 dark:to-gray-950" />
          </div>
        )}

        <div className="relative px-4 pt-4 pb-6 space-y-4">
          {/* Back link */}
          <button
            onClick={() => router.back()}
            className="inline-flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors min-h-[44px]"
          >
            <ArrowLeftIcon className="w-4 h-4" aria-hidden="true" />
            Back
          </button>

          {/* Cover art */}
          <div className="relative w-full aspect-square max-h-80 sm:max-h-[400px] rounded-2xl bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center shadow-xl ring-1 ring-black/5 dark:ring-white/10 mx-auto group">
            <CoverArtImage
              src={coverImageUrl || generatedFallbackUrl}
              alt={song.title}
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 400px"
              priority
              fallbackSrc={generatedFallbackUrl}
              songId={song.id}
            />
            {/* Generate Cover overlay button */}
            <button
              onClick={() => setCoverArtModalOpen(true)}
              className="absolute inset-0 flex items-end justify-center pb-3 bg-black/0 group-hover:bg-black/30 transition-colors"
              aria-label="Change cover art"
            >
              <span className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1.5 px-3 py-1.5 bg-black/70 text-white text-xs font-medium rounded-full">
                <PaintBrushIcon className="w-3.5 h-3.5" />
                {coverImageUrl ? "Change Cover" : "Generate Cover"}
              </span>
            </button>
          </div>

          {/* Title + favorite */}
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white flex-1">
                {song.title}
                {isHidden && (
                  <span className="ml-2 inline-block text-xs font-medium px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 align-middle">
                    Hidden
                  </span>
                )}
              </h1>
              <button
                onClick={handleToggleFavorite}
                aria-label={isFavorite ? "Remove from favorites" : "Add to favorites"}
                className={`flex-shrink-0 flex items-center gap-1 px-2 h-11 rounded-full transition-all duration-200 active:scale-95 ${
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
        </div>
      </div>

      <div className="px-4 space-y-6">

      {/* Hidden song appeal banner */}
      {isHidden && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-4">
          <p className="text-sm font-medium text-red-700 dark:text-red-400 mb-1">This song was removed by a moderator.</p>
          {appealStatus === "pending" ? (
            <p className="text-xs text-red-600 dark:text-red-400">Your appeal is under review.</p>
          ) : appealStatus === "approved" ? (
            <p className="text-xs text-green-600 dark:text-green-400">Your appeal was approved.</p>
          ) : appealStatus === "rejected" ? (
            <p className="text-xs text-red-600 dark:text-red-400">Your appeal was rejected.</p>
          ) : (
            <button
              onClick={() => setAppealOpen(true)}
              className="mt-1 text-xs font-medium text-red-700 dark:text-red-300 underline hover:no-underline"
            >
              Appeal this decision
            </button>
          )}
        </div>
      )}

      {/* Appeal modal */}
      {appealOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4" onClick={() => setAppealOpen(false)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-2xl p-6 w-full max-w-md shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold mb-2 text-gray-900 dark:text-white">Appeal removal</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
              Explain why you believe this song should be restored. Be specific — our team will review your appeal.
            </p>
            <textarea
              className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white p-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-violet-500"
              rows={5}
              placeholder="Describe why this content should be restored (min 10 characters)…"
              value={appealReason}
              onChange={(e) => setAppealReason(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-gray-400 text-right mt-1">{appealReason.length}/2000</p>
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setAppealOpen(false)}
                className="flex-1 py-2 rounded-xl border border-gray-200 dark:border-gray-700 text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitAppeal}
                disabled={appealSubmitting || appealReason.trim().length < 10}
                className="flex-1 py-2 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
              >
                {appealSubmitting ? "Submitting…" : "Submit appeal"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full metadata grid */}
      <SongMetadataCard
        tags={song.tags}
        duration={song.duration}
        createdAt={song.createdAt}
        model={song.model}
        ratingStars={rating.stars}
        sunoJobId={sunoJobId}
      />

      {/* Tags */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Tags</h2>
        <TagInput songId={song.id} initialTags={initialSongTags} />
      </div>

      {/* Play / pause via global player */}
      {hasAudio ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 flex items-center justify-center">
          <button
            onClick={() =>
              togglePlay({ id: song.id, title: song.title, audioUrl: song.audioUrl!, imageUrl: coverImageUrl ?? null, duration: song.duration ?? null, lyrics: song.lyrics })
            }
            aria-label={isThisSongPlaying ? "Pause" : "Play"}
            className="flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-xl bg-violet-600 hover:bg-violet-500 text-white shadow-sm transition-all duration-200 active:scale-95 min-h-[44px]"
          >
            {isThisSongPlaying ? (
              <PauseIcon className="w-5 h-5" aria-hidden="true" />
            ) : (
              <PlayIcon className="w-5 h-5" aria-hidden="true" />
            )}
            {isThisSongPlaying ? "Pause" : "Play"}
          </button>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 text-center text-sm text-gray-400 dark:text-gray-600">
          No audio available
        </div>
      )}

      {/* Action buttons row */}
      <SongActionsBar
        song={song}
        hasAudio={hasAudio}
        isPublic={isPublic}
        publicSlug={publicSlug}
        isCached={isCached}
        isSavingOffline={isSavingOffline}
        sharing={sharing}
        coverImageUrl={coverImageUrl}
        onVisibilityToggle={handleVisibilityToggle}
        onCopyLink={handleCopyLink}
        onShareOnX={handleShareOnX}
        onEmbedOpen={() => setEmbedOpen(true)}
        onReportOpen={() => setReportOpen(true)}
        onSaveOffline={() => saveOffline({ id: song.id, title: song.title, imageUrl: song.imageUrl ?? null })}
        onRemoveOffline={() => removeOffline(song.id)}
        onPlayNext={() => {
          playNext({ id: song.id, title: song.title, audioUrl: song.audioUrl!, imageUrl: coverImageUrl ?? null, duration: song.duration ?? null, lyrics: song.lyrics });
          toast("Playing next", "success");
        }}
        onAddToQueue={() => {
          addToQueue({ id: song.id, title: song.title, audioUrl: song.audioUrl!, imageUrl: coverImageUrl ?? null, duration: song.duration ?? null, lyrics: song.lyrics });
          toast("Added to queue", "success");
        }}
      />

      {/* Make public confirmation dialog */}
      {confirmPublicOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-public-title">
          <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4">
            <h2 id="confirm-public-title" className="text-lg font-semibold text-gray-900 dark:text-white">Make song public?</h2>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This song will be visible to anyone with the link.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setConfirmPublicOpen(false)}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { setConfirmPublicOpen(false); setVisibility("public"); }}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
              >
                Make public
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Report modal */}
      {reportOpen && (
        <ReportModal
          songId={song.id}
          songTitle={song.title}
          onClose={() => setReportOpen(false)}
        />
      )}

      {/* Embed code modal */}
      {embedOpen && (
        <EmbedCodeModal
          songId={song.id}
          theme={embedTheme}
          autoplay={embedAutoplay}
          onThemeChange={setEmbedTheme}
          onAutoplayChange={setEmbedAutoplay}
          onClose={() => setEmbedOpen(false)}
        />
      )}


      {/* Export / Format Conversion */}
      {hasAudio && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Export</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            <button
              onClick={() => handleExport("wav")}
              disabled={exports.wav.status === "converting"}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
            >
              <ArrowDownTrayIcon className="w-4 h-4" aria-hidden="true" />
              {exports.wav.status === "converting" ? "Converting..." : exports.wav.status === "done" ? "WAV Sent" : "WAV"}
            </button>
            <button
              onClick={() => handleExport("midi")}
              disabled={exports.midi.status === "converting"}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
            >
              <MusicalNoteIcon className="w-4 h-4" aria-hidden="true" />
              {exports.midi.status === "converting" ? "Extracting..." : exports.midi.status === "done" ? "MIDI Sent" : "MIDI"}
            </button>
            <button
              onClick={() => handleExport("mp4")}
              disabled={exports.mp4.status === "converting" || videoStatus === "polling"}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
            >
              <FilmIcon className="w-4 h-4" aria-hidden="true" />
              {exports.mp4.status === "converting" || videoStatus === "polling"
                ? "Generating..."
                : videoStatus === "ready"
                  ? "Regenerate Video"
                  : "Music Video"}
            </button>
          </div>
          {(exports.wav.status === "error" || exports.midi.status === "error" || exports.mp4.status === "error") && (
            <p className="text-xs text-red-400">
              {exports.wav.error || exports.midi.error || exports.mp4.error}
            </p>
          )}
        </div>
      )}

      {/* Music Video Player */}
      {videoStatus === "polling" && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Music Video</h2>
          <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
            <ArrowPathIcon className="w-5 h-5 animate-spin text-purple-500" aria-hidden="true" />
            <span>Generating your music video&hellip; This may take a minute.</span>
          </div>
        </div>
      )}

      {videoStatus === "ready" && videoUrl && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Music Video</h2>
          <div className="rounded-lg overflow-hidden bg-black">
            <video
              src={videoUrl}
              controls
              playsInline
              preload="metadata"
              className="w-full max-h-[400px]"
            />
          </div>
          <a
            href={videoUrl}
            download
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            <ArrowDownTrayIcon className="w-4 h-4" aria-hidden="true" />
            Download Video
          </a>
        </div>
      )}

      {videoStatus === "error" && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Music Video</h2>
          <p className="text-sm text-red-500">{videoError ?? "Video generation failed."}</p>
          <button
            onClick={() => handleExport("mp4")}
            className="inline-flex items-center gap-2 px-3 py-2 bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            <ArrowPathIcon className="w-4 h-4" aria-hidden="true" />
            Retry
          </button>
        </div>
      )}

      {/* Cover art */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Cover Art</h2>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative w-14 h-14 rounded-xl overflow-hidden border border-gray-200 dark:border-gray-700 flex-shrink-0">
            <CoverArtImage
              src={coverImageUrl || generatedFallbackUrl}
              alt="Cover art"
              fill
              className="object-cover"
              sizes="56px"
              fallbackSrc={generatedFallbackUrl}
              songId={song.id}
            />
          </div>
          <button
            onClick={() => setCoverArtModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            <PaintBrushIcon className="w-4 h-4" aria-hidden="true" />
            {coverImageUrl ? "Change Cover" : "Generate Cover"}
          </button>
        </div>
      </div>

      {/* Variation / Remix actions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Remix & Extend</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">{initialVariationCount}/{maxVariations} variations</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              if (initialVariationCount >= maxVariations) {
                toast(`Maximum ${maxVariations} variations reached`, "error");
                return;
              }
              setVariationModalOpen(true);
            }}
            disabled={initialVariationCount >= maxVariations}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            <ArrowPathIcon className="w-4 h-4" aria-hidden="true" />
            Create Variation
          </button>
          <button
            onClick={() => setRemixAction("extend")}
            disabled={initialVariationCount >= maxVariations}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            <ForwardIcon className="w-4 h-4" aria-hidden="true" />
            Extend
          </button>
          {isInstrumental ? (
            <button
              onClick={() => setRemixAction("add-vocals")}
              disabled={initialVariationCount >= maxVariations}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-pink-600 hover:bg-pink-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
            >
              <MicrophoneIcon className="w-4 h-4" aria-hidden="true" />
              Add Vocals
            </button>
          ) : (
            <button
              onClick={() => setRemixAction("add-instrumental")}
              disabled={initialVariationCount >= maxVariations}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-teal-600 hover:bg-teal-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
            >
              <SpeakerWaveIcon className="w-4 h-4" aria-hidden="true" />
              Add Instrumental
            </button>
          )}
          {canSeparateVocals ? (
            <button
              onClick={stemHook.openSeparateModal}
              disabled={!hasAudio}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
            >
              <ScissorsIcon className="w-4 h-4" aria-hidden="true" />
              Separate Vocals
            </button>
          ) : (
            <Link
              href="/pricing"
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 text-sm font-medium rounded-xl transition-colors min-h-[44px] hover:bg-violet-100 dark:hover:bg-violet-900/20 hover:text-violet-700 dark:hover:text-violet-400"
              title="Vocal Separation requires Pro or higher"
            >
              <ScissorsIcon className="w-4 h-4" aria-hidden="true" />
              Separate Vocals <span className="text-xs font-bold">(Pro+)</span>
            </Link>
          )}
          <button
            onClick={() => setSectionEditorOpen(true)}
            disabled={!hasAudio || !song.duration || initialVariationCount >= maxVariations}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px] col-span-2"
          >
            <PaintBrushIcon className="w-4 h-4" aria-hidden="true" />
            Replace Section
          </button>
          <button
            onClick={() => {
              const params = new URLSearchParams();
              if (song.title) params.set("title", song.title);
              if (song.tags) params.set("tags", song.tags);
              if (song.prompt) params.set("prompt", song.prompt);
              if (isInstrumental) params.set("instrumental", "1");
              params.set("sourceSongId", song.id);
              if (song.title) params.set("sourceSongTitle", song.title);
              router.push(`/generate?${params.toString()}`);
            }}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl transition-colors min-h-[44px] col-span-2"
          >
            <DocumentDuplicateIcon className="w-4 h-4" aria-hidden="true" />
            Use as Template
          </button>
        </div>
      </div>

      {/* Remix modal */}
      {variationModalOpen && (
        <CreateVariationModal
          sourceSong={{
            prompt: song.prompt ?? null,
            tags: song.tags ?? null,
            lyrics: song.lyrics ?? null,
            title: song.title ?? null,
            isInstrumental: isInstrumental,
          }}
          onClose={() => setVariationModalOpen(false)}
          onSubmit={handleCreateVariation}
          submitting={creatingVariation}
        />
      )}

      {remixAction && (
        <RemixModal
          action={remixAction}
          songTitle={song.title}
          songTags={song.tags ?? null}
          songDuration={song.duration ?? null}
          onClose={() => setRemixAction(null)}
          onSubmit={handleRemixSubmit}
          submitting={remixSubmitting}
        />
      )}

      {/* Separate Vocals modal */}
      {stemHook.separateModalOpen && (
        <SeparateVocalsModal
          onClose={stemHook.closeSeparateModal}
          onSubmit={stemHook.separate}
          submitting={stemHook.separateSubmitting}
        />
      )}

      {/* Section Editor modal */}
      {sectionEditorOpen && hasAudio && song.duration && (
        <SectionEditor
          songId={song.id}
          songTitle={song.title}
          songTags={song.tags ?? null}
          songDuration={song.duration}
          audioUrl={song.audioUrl}
          onClose={() => setSectionEditorOpen(false)}
          onSubmitted={(newSongId) => {
            setSectionEditorOpen(false);
            toast("Section replacement started!", "success");
            router.push(`/library/${newSongId}`);
          }}
        />
      )}

      {/* Stem viewer */}
      {stemHook.stems.length > 0 && (
        <StemsPlayer stems={stemHook.stems} onDownload={stemHook.downloadStem} onDownloadAll={stemHook.downloadAllStems} downloadingAll={stemHook.downloadingAll} />
      )}

      {/* Parent link */}
      {parentSongId && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Variation of:{" "}
          <Link href={`/library/${parentSongId}`} className="text-violet-600 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-300 underline">
            {parentSongTitle ?? "Original song"}
          </Link>
        </div>
      )}

      {/* Variation tree */}
      {initialVariations.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">
            Variations ({initialVariations.length}/{maxVariations})
          </h2>
          <div className="space-y-2">
            {initialVariations.map((v) => (
              <div
                key={v.id}
                className={`flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer ${
                  v.id === song.id
                    ? "border-violet-400 bg-violet-50 dark:bg-violet-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-600"
                }`}
              >
                <Link href={`/library/${v.id}`} className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white block truncate">
                    {v.title || "Untitled variation"}
                  </span>
                  <span className="text-xs text-gray-500 dark:text-gray-400 block truncate">
                    {v.tags || v.prompt || "No description"}
                  </span>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                      v.generationStatus === "ready"
                        ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                        : v.generationStatus === "failed"
                        ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                        : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                    }`}>
                      {v.generationStatus}
                    </span>
                    {v.isInstrumental && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-teal-100 dark:bg-teal-900/30 text-teal-600 dark:text-teal-400">
                        instrumental
                      </span>
                    )}
                    {v.duration != null && (
                      <span className="text-xs text-gray-400">{formatTime(v.duration)}</span>
                    )}
                  </div>
                </Link>
                {v.id !== song.id && v.generationStatus === "ready" && (
                  <div className="flex-shrink-0 flex flex-col gap-1">
                    <Link
                      href={`/compare?a=${song.id}&b=${v.id}`}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors"
                      title="Full compare page"
                    >
                      <ArrowsRightLeftIcon className="w-3 h-3" />
                      Compare
                    </Link>
                    <button
                      onClick={() => setCompareVariation(compareVariation?.id === v.id ? null : v)}
                      className={`px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                        compareVariation?.id === v.id
                          ? "bg-indigo-600 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600"
                      }`}
                    >
                      {compareVariation?.id === v.id ? "Hide" : "Quick"}
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Side-by-side comparison */}
      {compareVariation && (
        <div className="bg-white dark:bg-gray-900 border border-violet-300 dark:border-violet-700 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Comparison</h2>
            <button
              onClick={() => setCompareVariation(null)}
              className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              Close
            </button>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {/* Current song */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-violet-500 uppercase tracking-wide">Current</span>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{song.title || "Untitled"}</p>
              {song.tags && <p className="text-xs text-gray-500 dark:text-gray-400">{song.tags}</p>}
              {song.duration != null && <p className="text-xs text-gray-400">{formatTime(song.duration)}</p>}
              {song.audioUrl && (
                <audio src={song.audioUrl} controls className="w-full h-8" preload="none" />
              )}
              {song.lyrics && (
                <div className="max-h-40 overflow-y-auto">
                  <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">{song.lyrics}</p>
                </div>
              )}
            </div>
            {/* Comparison variation */}
            <div className="space-y-2">
              <span className="text-xs font-semibold text-violet-500 uppercase tracking-wide">Variation</span>
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">{compareVariation.title || "Untitled"}</p>
              {compareVariation.tags && <p className="text-xs text-gray-500 dark:text-gray-400">{compareVariation.tags}</p>}
              {compareVariation.duration != null && <p className="text-xs text-gray-400">{formatTime(compareVariation.duration)}</p>}
              {compareVariation.audioUrl && (
                <audio src={compareVariation.audioUrl} controls className="w-full h-8" preload="none" />
              )}
              {compareVariation.lyrics && (
                <div className="max-h-40 overflow-y-auto">
                  <p className="text-xs text-gray-500 dark:text-gray-400 whitespace-pre-line">{compareVariation.lyrics}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Similar songs */}
      <RecommendationSection
        songId={song.id}
        type="similar"
        title="Similar songs"
      />

      {/* Listeners also liked */}
      <RecommendationSection
        songId={song.id}
        type="also-liked"
        title="Listeners also liked"
      />

      {/* Lyrics */}
      <SongLyricsSection
        songId={song.id}
        lyrics={song.lyrics}
        lyricsEdited={lyricsEdited}
        isCurrentSong={currentSong?.id === song.id}
      />

      {/* Prompt */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 transition-shadow duration-200 hover:shadow-md">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide mb-2">Prompt</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400">{song.prompt}</p>
      </div>

      {/* Generation Feedback */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3 transition-shadow duration-200 hover:shadow-md">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Generation Quality</h2>
        <p className="text-xs text-gray-500 dark:text-gray-400">Was this generation good?</p>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleThumbsFeedback("thumbs_up")}
            disabled={savingThumbs}
            aria-label="Thumbs up — good generation"
            aria-pressed={thumbsRating === "thumbs_up"}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              thumbsRating === "thumbs_up"
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-300 dark:border-green-700"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-green-50 dark:hover:bg-green-900/20 hover:text-green-600 hover:border-green-200"
            }`}
          >
            {thumbsRating === "thumbs_up" ? (
              <HandThumbUpIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <HandThumbUpOutlineIcon className="h-5 w-5" aria-hidden="true" />
            )}
            Good
          </button>
          <button
            type="button"
            onClick={() => handleThumbsFeedback("thumbs_down")}
            disabled={savingThumbs}
            aria-label="Thumbs down — poor generation"
            aria-pressed={thumbsRating === "thumbs_down"}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors min-h-[44px] ${
              thumbsRating === "thumbs_down"
                ? "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 border border-red-300 dark:border-red-700"
                : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 border border-gray-200 dark:border-gray-700 hover:bg-red-50 dark:hover:bg-red-900/20 hover:text-red-600 hover:border-red-200"
            }`}
          >
            {thumbsRating === "thumbs_down" ? (
              <HandThumbDownIcon className="h-5 w-5" aria-hidden="true" />
            ) : (
              <HandThumbDownOutlineIcon className="h-5 w-5" aria-hidden="true" />
            )}
            Poor
          </button>
        </div>
      </div>

      {/* Rating */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3 transition-shadow duration-200 hover:shadow-md">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Your Rating</h2>

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

      {/* Cover Art Modal */}
      {coverArtModalOpen && (
        <CoverArtModal
          songId={song.id}
          songTitle={song.title}
          currentImageUrl={coverImageUrl}
          onClose={() => setCoverArtModalOpen(false)}
          onSave={(newUrl) => setCoverImageUrl(newUrl)}
        />
      )}
    </div>
  );
}
