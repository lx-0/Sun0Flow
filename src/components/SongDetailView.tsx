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
  FlagIcon,
  ForwardIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  XMarkIcon,
  ScissorsIcon,
} from "@heroicons/react/24/solid";
import { HeartIcon as HeartOutlineIcon } from "@heroicons/react/24/outline";
import type { SunoSong } from "@/lib/sunoapi";
import { getRating, setRating, type SongRating } from "@/lib/ratings";
import { downloadSongFile } from "@/lib/download";
import { useToast } from "./Toast";
import { WaveformPlayer } from "./WaveformPlayer";
import { TagInput } from "./TagInput";
import { ReportModal } from "./ReportModal";

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

// ─── Extend Modal ─────────────────────────────────────────────────────────────

type RemixAction = "extend" | "add-vocals" | "add-instrumental";

interface RemixModalProps {
  action: RemixAction;
  songTitle: string;
  songTags: string | null;
  songDuration: number | null;
  onClose: () => void;
  onSubmit: (action: RemixAction, data: Record<string, string | number | undefined>) => void;
  submitting: boolean;
}

function RemixModal({ action, songTitle, songTags, songDuration, onClose, onSubmit, submitting }: RemixModalProps) {
  const [prompt, setPrompt] = useState("");
  const [style, setStyle] = useState(songTags || "");
  const [title, setTitle] = useState("");
  const [continueAt, setContinueAt] = useState("");

  const actionLabel = action === "extend" ? "Extend Song" : action === "add-vocals" ? "Add Vocals" : "Add Instrumental";
  const actionDesc =
    action === "extend"
      ? "Continue this song with AI-generated audio from a specific point."
      : action === "add-vocals"
      ? "Add AI-generated vocals over this instrumental track."
      : "Generate instrumental backing for this vocal track.";

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const data: Record<string, string | number | undefined> = {};
    if (action === "extend") {
      data.prompt = prompt || undefined;
      data.style = style || undefined;
      data.title = title || undefined;
      if (continueAt) data.continueAt = parseFloat(continueAt);
    } else if (action === "add-vocals") {
      data.prompt = prompt;
      data.style = style || undefined;
      data.title = title || undefined;
    } else {
      data.tags = style || undefined;
      data.title = title || undefined;
    }
    onSubmit(action, data);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{actionLabel}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">{actionDesc}</p>

        <form onSubmit={handleSubmit} className="space-y-3">
          {(action === "extend" || action === "add-vocals") && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                {action === "add-vocals" ? "Vocal prompt *" : "Prompt (optional)"}
              </label>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder={action === "add-vocals" ? "Describe the vocals you want..." : "Override the continuation prompt..."}
                rows={3}
                required={action === "add-vocals"}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
              Style / tags {action === "add-instrumental" ? "*" : "(optional)"}
            </label>
            <input
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder="e.g. pop, rock, electronic"
              required={action === "add-instrumental"}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={songTitle ? `${songTitle} (${action === "extend" ? "extended" : action === "add-vocals" ? "with vocals" : "instrumental"})` : ""}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {action === "extend" && (
            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
                Continue at (seconds, optional)
              </label>
              <input
                type="number"
                value={continueAt}
                onChange={(e) => setContinueAt(e.target.value)}
                placeholder={songDuration ? `0 – ${Math.floor(songDuration)}` : "e.g. 30"}
                min={0}
                max={songDuration ?? undefined}
                step={1}
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            {submitting ? "Generating..." : actionLabel}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Separate Vocals Modal ───────────────────────────────────────────────────

interface SeparateVocalsModalProps {
  onClose: () => void;
  onSubmit: (type: "separate_vocal" | "split_stem") => void;
  submitting: boolean;
}

function SeparateVocalsModal({ onClose, onSubmit, submitting }: SeparateVocalsModalProps) {
  const [mode, setMode] = useState<"separate_vocal" | "split_stem">("separate_vocal");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Separate Vocals</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Split this track into separate vocal and instrumental stems.
        </p>

        <div className="space-y-2">
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Quality mode</label>
          <button
            onClick={() => setMode("separate_vocal")}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
              mode === "separate_vocal"
                ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                : "border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-600"
            }`}
          >
            <span className="text-sm font-medium text-gray-900 dark:text-white block">Standard</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Vocals + Instrumental &middot; 10 credits</span>
          </button>
          <button
            onClick={() => setMode("split_stem")}
            className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
              mode === "split_stem"
                ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                : "border-gray-200 dark:border-gray-700 hover:border-violet-300 dark:hover:border-violet-600"
            }`}
          >
            <span className="text-sm font-medium text-gray-900 dark:text-white block">High Quality</span>
            <span className="text-xs text-gray-500 dark:text-gray-400">Full stem separation &middot; 50 credits</span>
          </button>
        </div>

        <button
          onClick={() => onSubmit(mode)}
          disabled={submitting}
          className="w-full px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
        >
          {submitting ? "Separating..." : `Separate (${mode === "split_stem" ? "50" : "10"} credits)`}
        </button>
      </div>
    </div>
  );
}

// ─── Stem Viewer ────────────────────────────────────────────────────────────

interface StemViewerProps {
  stems: StemTrack[];
  onDownload: (stem: StemTrack) => void;
}

interface StemTrack {
  id: string;
  title: string | null;
  audioUrl: string | null;
  generationStatus: string;
  duration: number | null;
}

function StemViewer({ stems, onDownload }: StemViewerProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <ScissorsIcon className="w-4 h-4 text-violet-400" aria-hidden="true" />
        Separated Stems
      </h2>
      <div className="space-y-2">
        {stems.map((stem) => (
          <div
            key={stem.id}
            className="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700"
          >
            <div className="flex-1 min-w-0">
              <span className="text-sm font-medium text-gray-900 dark:text-white block truncate">
                {stem.title || "Stem"}
              </span>
              <div className="flex items-center gap-2 mt-1">
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  stem.generationStatus === "ready"
                    ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                    : stem.generationStatus === "failed"
                    ? "bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400"
                    : "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                }`}>
                  {stem.generationStatus === "ready" ? "ready" : stem.generationStatus === "failed" ? "failed" : "processing"}
                </span>
                {stem.duration != null && (
                  <span className="text-xs text-gray-400">{formatTime(stem.duration)}</span>
                )}
              </div>
            </div>
            {stem.generationStatus === "ready" && stem.audioUrl && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <audio src={stem.audioUrl} controls preload="none" className="h-8 w-36" />
                <button
                  onClick={() => onDownload(stem)}
                  aria-label={`Download ${stem.title || "stem"}`}
                  className="p-2 text-gray-500 hover:text-violet-500 dark:text-gray-400 dark:hover:text-violet-400 transition-colors"
                >
                  <ArrowDownTrayIcon className="w-4 h-4" />
                </button>
              </div>
            )}
            {stem.generationStatus === "pending" && (
              <div className="flex-shrink-0">
                <div className="w-5 h-5 border-2 border-violet-400 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </div>
        ))}
      </div>
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
  playlists?: PlaylistOption[];
  isPublic?: boolean;
  publicSlug?: string | null;
  isHidden?: boolean;
  isInstrumental?: boolean;
  songTags?: SongTag[];
  variations?: VariationSummary[];
  variationCount?: number;
  maxVariations?: number;
  parentSongId?: string | null;
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
  isHidden = false,
  isInstrumental = false,
  songTags: initialSongTags = [],
  variations: initialVariations = [],
  variationCount: initialVariationCount = 0,
  maxVariations = 5,
  parentSongId = null,
}: SongDetailViewProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [isFavorite, setIsFavorite] = useState(initialFavorite);
  const [favoriteCount, setFavoriteCount] = useState(initialFavoriteCount);

  // Variation state
  const [creatingVariation, setCreatingVariation] = useState(false);
  const [compareVariation, setCompareVariation] = useState<VariationSummary | null>(null);
  const [remixAction, setRemixAction] = useState<RemixAction | null>(null);
  const [remixSubmitting, setRemixSubmitting] = useState(false);

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

  // Report modal
  const [reportOpen, setReportOpen] = useState(false);

  // Vocal separation state
  const [separateModalOpen, setSeparateModalOpen] = useState(false);
  const [separateSubmitting, setSeparateSubmitting] = useState(false);
  const [stems, setStems] = useState<StemTrack[]>([]);
  const stemPollRef = useRef<NodeJS.Timeout | null>(null);

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

  // Poll a stem song for status updates until terminal
  function pollStemStatus(stemId: string) {
    const poll = async () => {
      try {
        const res = await fetch(`/api/songs/${stemId}/status`);
        if (!res.ok) return;
        const data = await res.json();
        const updated = data.song;
        setStems((prev) =>
          prev.map((s) =>
            s.id === stemId
              ? { ...s, generationStatus: updated.generationStatus, audioUrl: updated.audioUrl, duration: updated.duration }
              : s
          )
        );
        if (updated.generationStatus === "ready" || updated.generationStatus === "failed") {
          return; // stop polling
        }
        stemPollRef.current = setTimeout(poll, 5000);
      } catch {
        // retry on network error
        stemPollRef.current = setTimeout(poll, 10000);
      }
    };
    stemPollRef.current = setTimeout(poll, 3000);
  }

  // Clean up stem polling on unmount
  useEffect(() => {
    return () => {
      if (stemPollRef.current) clearTimeout(stemPollRef.current);
    };
  }, []);

  async function handleSeparateVocals(type: "separate_vocal" | "split_stem") {
    if (separateSubmitting) return;
    setSeparateSubmitting(true);
    try {
      const res = await fetch(`/api/songs/${song.id}/separate-vocals`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
      });
      const result = await res.json();
      if (!res.ok) {
        toast(result.error ?? "Vocal separation failed", "error");
        return;
      }
      toast("Vocal separation started!", "success");
      setSeparateModalOpen(false);
      const newStem: StemTrack = {
        id: result.song.id,
        title: result.song.title,
        audioUrl: result.song.audioUrl,
        generationStatus: result.song.generationStatus,
        duration: result.song.duration,
      };
      setStems((prev) => [...prev, newStem]);
      if (newStem.generationStatus === "pending") {
        pollStemStatus(newStem.id);
      }
    } catch {
      toast("Vocal separation failed", "error");
    } finally {
      setSeparateSubmitting(false);
    }
  }

  async function handleDownloadStem(stem: StemTrack) {
    if (!stem.audioUrl) return;
    try {
      const a = document.createElement("a");
      a.href = stem.audioUrl;
      a.download = `${stem.title || "stem"}.mp3`;
      a.target = "_blank";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } catch {
      toast("Download failed", "error");
    }
  }

  async function handleCreateVariation() {
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
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        toast(data.error ?? "Failed to create variation", "error");
        return;
      }
      toast("Variation generation started!", "success");
      router.push(`/library/${data.song.id}`);
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
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex-1">
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

        {/* Report button */}
        <button
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg bg-gray-200 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors min-h-[44px]"
          aria-label="Report song"
        >
          <FlagIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          Report
        </button>
      </div>

      {/* Report modal */}
      {reportOpen && (
        <ReportModal
          songId={song.id}
          songTitle={song.title}
          onClose={() => setReportOpen(false)}
        />
      )}

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

      {/* Variation / Remix actions */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Remix & Extend</h2>
          <span className="text-xs text-gray-400 dark:text-gray-500">{initialVariationCount}/{maxVariations} variations</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={handleCreateVariation}
            disabled={creatingVariation || initialVariationCount >= maxVariations}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            <ArrowPathIcon className="w-4 h-4" aria-hidden="true" />
            {creatingVariation ? "Creating..." : "Variation"}
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
          <button
            onClick={() => setSeparateModalOpen(true)}
            disabled={!hasAudio}
            className="flex items-center justify-center gap-2 px-3 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            <ScissorsIcon className="w-4 h-4" aria-hidden="true" />
            Separate Vocals
          </button>
        </div>
      </div>

      {/* Remix modal */}
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
      {separateModalOpen && (
        <SeparateVocalsModal
          onClose={() => setSeparateModalOpen(false)}
          onSubmit={handleSeparateVocals}
          submitting={separateSubmitting}
        />
      )}

      {/* Stem viewer */}
      {stems.length > 0 && (
        <StemViewer stems={stems} onDownload={handleDownloadStem} />
      )}

      {/* Parent link */}
      {parentSongId && (
        <div className="text-sm text-gray-500 dark:text-gray-400">
          This is a variation of{" "}
          <Link href={`/library/${parentSongId}`} className="text-violet-500 hover:text-violet-400 underline">
            the original song
          </Link>
        </div>
      )}

      {/* Variation tree */}
      {initialVariations.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">
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
                  <button
                    onClick={() => setCompareVariation(compareVariation?.id === v.id ? null : v)}
                    className={`flex-shrink-0 px-2 py-1 text-xs font-medium rounded-lg transition-colors ${
                      compareVariation?.id === v.id
                        ? "bg-violet-600 text-white"
                        : "bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-violet-100 dark:hover:bg-violet-900/30"
                    }`}
                  >
                    Compare
                  </button>
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
            <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Comparison</h2>
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
