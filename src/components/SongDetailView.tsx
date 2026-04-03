"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  ShareIcon,
  CalendarIcon,
  ClockIcon,
  TagIcon,
  FlagIcon,
  ForwardIcon,
  MicrophoneIcon,
  SpeakerWaveIcon,
  SpeakerXMarkIcon,
  XMarkIcon,
  ScissorsIcon,
  PaintBrushIcon,
  FilmIcon,
  PlayIcon,
  PauseIcon,
  HandThumbUpIcon,
  HandThumbDownIcon,
  CodeBracketIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/solid";
import { HeartIcon as HeartOutlineIcon, QueueListIcon, HandThumbUpIcon as HandThumbUpOutlineIcon, HandThumbDownIcon as HandThumbDownOutlineIcon, CloudArrowDownIcon, CheckCircleIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";
import { useOfflineCache } from "@/hooks/useOfflineCache";
import type { SunoSong } from "@/lib/sunoapi";
import { getRating, type SongRating } from "@/lib/ratings";
import { DownloadButton } from "./DownloadButton";
import { useToast } from "./Toast";
import { useQueue } from "./QueueContext";
const ReportModal = dynamic(() => import("./ReportModal").then((m) => m.ReportModal), { ssr: false });
import { TagInput } from "./TagInput";
// Lazy-load modal/tool components that are only shown on user interaction
const SectionEditor = dynamic(() => import("./SectionEditor").then((m) => m.SectionEditor), { ssr: false });
const CoverArtModal = dynamic(() => import("./CoverArtModal").then((m) => m.CoverArtModal), { ssr: false });
import { LyricsEditor } from "./LyricsEditor";
import { CoverArtImage } from "./CoverArtImage";
import { AddToPlaylistButton } from "./AddToPlaylistButton";
// Lazy-load below-fold recommendations to reduce initial bundle
const RecommendationSection = dynamic(() => import("./SongRecommendations").then((m) => m.RecommendationSection), { ssr: false });

// ─── EmbedCodeModal ───────────────────────────────────────────────────────────

function EmbedCodeModal({
  songId,
  theme,
  autoplay,
  onThemeChange,
  onAutoplayChange,
  onClose,
}: {
  songId: string;
  theme: "dark" | "light";
  autoplay: boolean;
  onThemeChange: (t: "dark" | "light") => void;
  onAutoplayChange: (v: boolean) => void;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const autoplayParam = autoplay ? "&autoplay=1" : "";
  const src = `${origin}/embed/${songId}?theme=${theme}${autoplayParam}`;
  const snippet = `<iframe\n  src="${src}"\n  width="100%"\n  height="96"\n  frameborder="0"\n  allow="autoplay"\n  loading="lazy"\n  title="SunoFlow player"\n></iframe>`;

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-2xl w-full max-w-lg p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Get Embed Code</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Options */}
        <div className="flex flex-wrap gap-4">
          {/* Theme */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Theme</p>
            <div className="flex gap-2">
              {(["dark", "light"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => onThemeChange(t)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg capitalize transition-colors ${
                    theme === t
                      ? "bg-violet-600 text-white"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Autoplay */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">Autoplay</p>
            <button
              onClick={() => onAutoplayChange(!autoplay)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                autoplay
                  ? "bg-violet-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              }`}
            >
              {autoplay ? "On" : "Off"}
            </button>
          </div>
        </div>

        {/* Snippet */}
        <div className="relative">
          <pre className="bg-gray-950 text-green-400 text-xs rounded-xl p-4 overflow-x-auto whitespace-pre-wrap break-all leading-relaxed">
            {snippet}
          </pre>
          <button
            onClick={handleCopy}
            className="absolute top-2 right-2 px-2 py-1 text-xs rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 transition-colors"
          >
            {copied ? "Copied!" : "Copy"}
          </button>
        </div>

        {/* Preview label */}
        <p className="text-xs text-gray-400 dark:text-gray-500">
          Paste this snippet into any HTML page to embed the player.
        </p>
      </div>
    </div>
  );
}

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

// ─── Create Variation Modal ───────────────────────────────────────────────────

interface CreateVariationModalProps {
  sourceSong: { prompt: string | null; tags: string | null; lyrics: string | null; title: string | null; isInstrumental?: boolean };
  onClose: () => void;
  onSubmit: (data: { prompt: string; tags: string; lyrics: string; title: string; makeInstrumental: boolean }) => void;
  submitting: boolean;
}

const TEMPO_OPTIONS = [
  { value: "", label: "Original tempo" },
  { value: "faster tempo", label: "Faster" },
  { value: "slower tempo", label: "Slower" },
  { value: "uptempo", label: "Uptempo" },
  { value: "downtempo", label: "Downtempo" },
];

const MOOD_OPTIONS = [
  { value: "", label: "Original mood" },
  { value: "happy", label: "Happy" },
  { value: "melancholic", label: "Melancholic" },
  { value: "dark", label: "Dark" },
  { value: "energetic", label: "Energetic" },
  { value: "chill", label: "Chill" },
  { value: "romantic", label: "Romantic" },
  { value: "epic", label: "Epic" },
];

function CreateVariationModal({ sourceSong, onClose, onSubmit, submitting }: CreateVariationModalProps) {
  const [prompt, setPrompt] = useState(sourceSong.prompt ?? "");
  const [tags, setTags] = useState(sourceSong.tags ?? "");
  const [lyrics, setLyrics] = useState(sourceSong.lyrics ?? "");
  const [title, setTitle] = useState(sourceSong.title ? `${sourceSong.title} (variation)` : "");
  const [makeInstrumental, setMakeInstrumental] = useState(sourceSong.isInstrumental ?? false);
  const [tempoShift, setTempoShift] = useState("");
  const [moodModifier, setMoodModifier] = useState("");
  const [instrumentSwap, setInstrumentSwap] = useState("");

  function buildEnrichedTags(): string {
    const modifiers = [tempoShift, moodModifier, instrumentSwap.trim()].filter(Boolean);
    const base = tags.trim();
    if (!modifiers.length) return base;
    return base ? `${base}, ${modifiers.join(", ")}` : modifiers.join(", ");
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit({ prompt, tags: buildEnrichedTags(), lyrics, title, makeInstrumental });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl w-full max-w-md p-5 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Create Variation</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 p-1">
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Pre-filled from the source song. Modify any field before generating.
        </p>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Prompt *</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the song..."
              rows={3}
              required
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Style / tags (optional)</label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="e.g. pop, rock, electronic"
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          {/* Variation parameters */}
          <div className="border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-3">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Variation parameters</p>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Tempo shift</label>
                <select
                  value={tempoShift}
                  onChange={(e) => setTempoShift(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-violet-500 transition-colors"
                >
                  {TEMPO_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Mood</label>
                <select
                  value={moodModifier}
                  onChange={(e) => setMoodModifier(e.target.value)}
                  className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-2 py-2 text-sm text-gray-900 dark:text-white focus:outline-none focus:border-violet-500 transition-colors"
                >
                  {MOOD_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Instrument swap (optional)</label>
              <input
                type="text"
                value={instrumentSwap}
                onChange={(e) => setInstrumentSwap(e.target.value)}
                placeholder="e.g. piano, guitar, strings, synthesizer"
                className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Lyrics (optional)</label>
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Enter lyrics or leave blank for AI-generated lyrics..."
              rows={4}
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 resize-none focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Variation title..."
              className="w-full bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-600 focus:outline-none focus:border-violet-500 transition-colors"
            />
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={makeInstrumental}
              onChange={(e) => setMakeInstrumental(e.target.checked)}
              className="w-4 h-4 accent-violet-600"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">Instrumental</span>
          </label>

          <button
            type="submit"
            disabled={submitting || !prompt.trim()}
            className="w-full px-4 py-3 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
          >
            {submitting ? "Generating..." : "Create Variation"}
          </button>
        </form>
      </div>
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

// ─── Stems Player ────────────────────────────────────────────────────────────

interface StemTrack {
  id: string;
  title: string | null;
  audioUrl: string | null;
  generationStatus: string;
  duration: number | null;
}

interface TrackState {
  muted: boolean;
  soloed: boolean;
  volume: number;
}

interface StemsPlayerProps {
  stems: StemTrack[];
  onDownload: (stem: StemTrack) => void;
  onDownloadAll: () => void;
  downloadingAll: boolean;
}

function StemsPlayer({ stems, onDownload, onDownloadAll, downloadingAll }: StemsPlayerProps) {
  const readyStems = stems.filter((s) => s.generationStatus === "ready" && s.audioUrl);
  const pendingStems = stems.filter((s) => s.generationStatus !== "ready" && s.generationStatus !== "failed");
  const hasMultipleReady = readyStems.length > 1;

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [trackStates, setTrackStates] = useState<TrackState[]>(() =>
    stems.map(() => ({ muted: false, soloed: false, volume: 1 }))
  );

  const audioRefs = useRef<(HTMLAudioElement | null)[]>([]);
  const gainNodes = useRef<(GainNode | null)[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const connectedRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const seekingRef = useRef(false);

  // Sync track state array length with stems array
  const stemsLength = stems.length;
  useEffect(() => {
    setTrackStates((prev) => {
      if (prev.length === stemsLength) return prev;
      return Array.from({ length: stemsLength }, (_, i) => prev[i] ?? { muted: false, soloed: false, volume: 1 });
    });
  }, [stemsLength]);

  // Set duration from the first ready stem
  useEffect(() => {
    const first = readyStems[0];
    if (first?.duration) setDuration(first.duration);
  }, [readyStems]);

  // RAF loop to update current time during playback
  const startTimeTracking = useCallback(() => {
    const tick = () => {
      const lead = audioRefs.current.find((a) => a && !a.paused);
      if (lead && !seekingRef.current) {
        setCurrentTime(lead.currentTime);
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  const stopTimeTracking = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    const audios = audioRefs.current;
    const ctx = audioCtxRef;
    return () => {
      stopTimeTracking();
      audios.forEach((a) => {
        if (a) { a.pause(); a.src = ""; }
      });
      if (ctx.current) {
        ctx.current.close().catch(() => {});
      }
    };
  }, [stopTimeTracking]);

  function getEffectiveGain(idx: number, states: TrackState[]): number {
    const hasSolo = states.some((t) => t.soloed);
    const t = states[idx];
    if (!t) return 0;
    if (hasSolo && !t.soloed) return 0;
    if (t.muted) return 0;
    return t.volume;
  }

  function applyGain(idx: number, states: TrackState[]) {
    const gn = gainNodes.current[idx];
    if (gn) gn.gain.value = getEffectiveGain(idx, states);
  }

  function connectWebAudio() {
    if (connectedRef.current) return;
    if (typeof AudioContext === "undefined") return;
    if (!audioCtxRef.current) {
      audioCtxRef.current = new AudioContext();
    }
    const ctx = audioCtxRef.current;
    readyStems.forEach((_, i) => {
      const audio = audioRefs.current[i];
      if (!audio) return;
      if (gainNodes.current[i]) return; // already connected
      try {
        const src = ctx.createMediaElementSource(audio);
        const gain = ctx.createGain();
        gain.gain.value = getEffectiveGain(i, trackStates);
        src.connect(gain);
        gain.connect(ctx.destination);
        gainNodes.current[i] = gain;
      } catch {
        // Already connected or not supported
      }
    });
    connectedRef.current = true;
  }

  async function handlePlay() {
    if (!hasMultipleReady) return;
    connectWebAudio();
    if (audioCtxRef.current?.state === "suspended") {
      await audioCtxRef.current.resume();
    }
    // Sync all to leader's time first
    const leader = audioRefs.current.find((a) => a);
    const syncTime = leader?.currentTime ?? currentTime;
    audioRefs.current.forEach((a) => {
      if (a && Math.abs(a.currentTime - syncTime) > 0.1) {
        a.currentTime = syncTime;
      }
    });
    await Promise.all(
      audioRefs.current
        .filter((a): a is HTMLAudioElement => a !== null)
        .map((a) => a.play().catch(() => {}))
    );
    setIsPlaying(true);
    startTimeTracking();
  }

  function handlePause() {
    audioRefs.current.forEach((a) => a?.pause());
    setIsPlaying(false);
    stopTimeTracking();
  }

  function handleSeek(value: number) {
    seekingRef.current = true;
    setCurrentTime(value);
    audioRefs.current.forEach((a) => {
      if (a) a.currentTime = value;
    });
    seekingRef.current = false;
  }

  function handleEnded() {
    setIsPlaying(false);
    setCurrentTime(0);
    stopTimeTracking();
    audioRefs.current.forEach((a) => { if (a) a.currentTime = 0; });
  }

  function toggleMute(idx: number) {
    setTrackStates((prev) => {
      const next = prev.map((t, i) => i === idx ? { ...t, muted: !t.muted } : t);
      applyGain(idx, next);
      return next;
    });
  }

  function toggleSolo(idx: number) {
    setTrackStates((prev) => {
      const next = prev.map((t, i) => i === idx ? { ...t, soloed: !t.soloed } : t);
      next.forEach((_, i) => applyGain(i, next));
      return next;
    });
  }

  function handleVolume(idx: number, value: number) {
    setTrackStates((prev) => {
      const next = prev.map((t, i) => i === idx ? { ...t, volume: value } : t);
      applyGain(idx, next);
      return next;
    });
  }

  const hasSolo = trackStates.some((t) => t.soloed);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 flex items-center gap-2">
          <ScissorsIcon className="w-4 h-4 text-violet-400" aria-hidden="true" />
          Stems Preview
        </h2>
        {readyStems.length > 1 && (
          <button
            onClick={onDownloadAll}
            disabled={downloadingAll}
            className="flex items-center gap-1.5 text-xs text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300 disabled:opacity-50 transition-colors"
          >
            <ArrowDownTrayIcon className="w-3.5 h-3.5" />
            {downloadingAll ? "Preparing…" : "Download All"}
          </button>
        )}
      </div>

      {/* Pending stems notice */}
      {pendingStems.length > 0 && (
        <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400">
          <div className="w-3.5 h-3.5 border-2 border-yellow-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
          Processing {pendingStems.length} stem{pendingStems.length > 1 ? "s" : ""}…
        </div>
      )}

      {/* Stem tracks */}
      <div className="space-y-2">
        {stems.map((stem, idx) => {
          const ts = trackStates[idx] ?? { muted: false, soloed: false, volume: 1 };
          const isReady = stem.generationStatus === "ready" && stem.audioUrl;
          const isSoloDimmed = hasSolo && !ts.soloed;
          return (
            <div
              key={stem.id}
              className={`flex items-center gap-2 p-2.5 rounded-lg border transition-colors ${
                isSoloDimmed
                  ? "border-gray-100 dark:border-gray-800 opacity-40"
                  : "border-gray-200 dark:border-gray-700"
              }`}
            >
              {/* Hidden audio element */}
              {isReady && hasMultipleReady && (
                <audio
                  ref={(el) => { audioRefs.current[idx] = el; }}
                  src={stem.audioUrl ?? ""}
                  preload="auto"
                  onEnded={handleEnded}
                  onDurationChange={(e) => {
                    if (idx === 0) setDuration((e.target as HTMLAudioElement).duration);
                  }}
                  className="hidden"
                />
              )}

              {/* Track name */}
              <div className="flex-1 min-w-0">
                <span className="text-xs font-medium text-gray-900 dark:text-white block truncate">
                  {stem.title || `Stem ${idx + 1}`}
                </span>
              </div>

              {isReady ? (
                <>
                  {hasMultipleReady ? (
                    <>
                      {/* Volume slider */}
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={ts.volume}
                        onChange={(e) => handleVolume(idx, parseFloat(e.target.value))}
                        aria-label={`Volume for ${stem.title || "stem"}`}
                        className="w-16 h-1 accent-violet-500 cursor-pointer"
                      />
                      {/* Mute button */}
                      <button
                        onClick={() => toggleMute(idx)}
                        aria-label={ts.muted ? `Unmute ${stem.title || "stem"}` : `Mute ${stem.title || "stem"}`}
                        className={`p-1.5 rounded transition-colors ${
                          ts.muted
                            ? "text-red-500 bg-red-100 dark:bg-red-900/30"
                            : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                        }`}
                      >
                        {ts.muted ? <SpeakerXMarkIcon className="w-4 h-4" /> : <SpeakerWaveIcon className="w-4 h-4" />}
                      </button>
                      {/* Solo button */}
                      <button
                        onClick={() => toggleSolo(idx)}
                        aria-label={ts.soloed ? `Unsolo ${stem.title || "stem"}` : `Solo ${stem.title || "stem"}`}
                        className={`px-2 py-1 rounded text-xs font-bold transition-colors ${
                          ts.soloed
                            ? "bg-violet-500 text-white"
                            : "bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                        }`}
                      >
                        S
                      </button>
                    </>
                  ) : (
                    /* Single stem: show native audio control */
                    <audio src={stem.audioUrl ?? ""} controls preload="none" className="h-8 w-36" />
                  )}
                  {/* Download */}
                  <button
                    onClick={() => onDownload(stem)}
                    aria-label={`Download ${stem.title || "stem"}`}
                    className="p-1.5 text-gray-500 hover:text-violet-500 dark:text-gray-400 dark:hover:text-violet-400 transition-colors flex-shrink-0"
                  >
                    <ArrowDownTrayIcon className="w-4 h-4" />
                  </button>
                </>
              ) : stem.generationStatus === "failed" ? (
                <span className="text-xs text-red-500">Failed</span>
              ) : (
                <div className="w-4 h-4 border-2 border-violet-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>

      {/* Shared transport for multi-track */}
      {hasMultipleReady && (
        <div className="pt-2 border-t border-gray-100 dark:border-gray-800 space-y-2">
          {/* Seek bar */}
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.1}
            value={currentTime}
            onChange={(e) => handleSeek(parseFloat(e.target.value))}
            aria-label="Seek"
            className="w-full h-1 accent-violet-500 cursor-pointer"
          />
          <div className="flex items-center justify-between">
            <button
              onClick={isPlaying ? handlePause : handlePlay}
              aria-label={isPlaying ? "Pause" : "Play all stems"}
              className="flex items-center gap-2 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors min-w-[72px] justify-center"
            >
              {isPlaying ? <PauseIcon className="w-4 h-4" /> : <PlayIcon className="w-4 h-4" />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <span className="text-xs text-gray-400 tabular-nums">
              {formatTime(currentTime)} / {formatTime(duration)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
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

  // Download state is now managed inside DownloadButton

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
        // Already submitted
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

  // Vocal separation state
  const [separateModalOpen, setSeparateModalOpen] = useState(false);
  const [separateSubmitting, setSeparateSubmitting] = useState(false);
  const [stems, setStems] = useState<StemTrack[]>([]);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const stemPollRef = useRef<NodeJS.Timeout | null>(null);

  // Section editor state
  const [sectionEditorOpen, setSectionEditorOpen] = useState(false);

  // Cover art state
  const [coverArtModalOpen, setCoverArtModalOpen] = useState(false);
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(song.imageUrl ?? null);

  // Export/conversion state
  type ExportFormat = "wav" | "midi" | "mp4";
  type ExportStatus = "idle" | "converting" | "done" | "error";
  const [exports, setExports] = useState<Record<ExportFormat, { status: ExportStatus; taskId?: string; error?: string }>>({
    wav: { status: "idle" },
    midi: { status: "idle" },
    mp4: { status: "idle" },
  });

  const hasAudio = Boolean(song.audioUrl);

  // Fallback: load from backend Rating model if no DB rating on Song
  useEffect(() => {
    if (initialRating) return; // Song-level DB rating takes precedence
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
      // Going public — show confirmation first
      setConfirmPublicOpen(true);
    } else {
      setVisibility("private");
    }
  }

  async function handleCopyLink() {
    if (!publicSlug) return;
    const url = `${window.location.origin}/s/${publicSlug}`;

    // Mobile: use native Web Share API if available
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: song.title ?? "Check out this song", url });
        track("song_shared", { songId: song.id, source: "song_detail", method: "web_share_api" });
        return;
      } catch (err) {
        // User cancelled — do not fall through
        if (err instanceof Error && err.name === "AbortError") return;
        // Other errors fall through to clipboard
      }
    }

    // Desktop / fallback: clipboard copy
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

  // Fetch child stem tracks for a completed split_stem song and merge them in
  async function loadChildStems(parentStemId: string) {
    try {
      const res = await fetch(`/api/songs/${parentStemId}/stems`);
      if (!res.ok) return;
      const data = await res.json();
      const children: StemTrack[] = (data.stems ?? []).map(
        (s: { id: string; title: string | null; audioUrl: string | null; generationStatus: string; duration: number | null }) => ({
          id: s.id,
          title: s.title,
          audioUrl: s.audioUrl,
          generationStatus: s.generationStatus,
          duration: s.duration,
        })
      );
      if (children.length > 0) {
        setStems((prev) => {
          const existingIds = new Set(prev.map((s) => s.id));
          const newOnes = children.filter((c) => !existingIds.has(c.id));
          return newOnes.length > 0 ? [...prev, ...newOnes] : prev;
        });
        // Poll any pending children
        children.forEach((c) => {
          if (c.generationStatus !== "ready" && c.generationStatus !== "failed") {
            pollStemStatus(c.id);
          }
        });
      }
    } catch {
      // non-fatal
    }
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
        if (updated.generationStatus === "ready") {
          // Fetch any child stems created by the status route (split_stem yields 4 tracks)
          loadChildStems(stemId);
          return;
        }
        if (updated.generationStatus === "failed") {
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

  async function handleDownloadAllStems() {
    const readyStems = stems.filter((s) => s.generationStatus === "ready" && s.audioUrl);
    if (readyStems.length === 0 || downloadingAll) return;
    setDownloadingAll(true);
    try {
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      await Promise.all(
        readyStems.map(async (stem, idx) => {
          const res = await fetch(stem.audioUrl!);
          const blob = await res.blob();
          const name = `${stem.title || `stem-${idx + 1}`}.mp3`.replace(/[/\\:*?"<>|]/g, "_");
          zip.file(name, blob);
        })
      );
      const content = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(content);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${song.title || "stems"}-stems.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast("Failed to download stems", "error");
    } finally {
      setDownloadingAll(false);
    }
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
      toast(`${labels[format]} started! Task ID: ${data.taskId}`, "success");
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
        {coverImageUrl && (
          <div className="absolute inset-0">
            <CoverArtImage
              src={coverImageUrl}
              alt=""
              fill
              className="object-cover scale-110 blur-2xl opacity-60"
              sizes="100vw"
              priority
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
            {coverImageUrl ? (
              <CoverArtImage
                src={coverImageUrl}
                alt={song.title}
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 400px"
                priority
              />
            ) : (
              <MusicalNoteIcon className="w-20 h-20 text-gray-400 dark:text-gray-600" aria-hidden="true" />
            )}
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
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 transition-shadow duration-200 hover:shadow-md">
        <div className="grid grid-cols-2 gap-3 text-sm">
          {song.tags && (
            <div className="flex items-start gap-2">
              <TagIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Style</span>
                <span className="text-gray-900 dark:text-white">{song.tags}</span>
              </div>
            </div>
          )}
          {song.duration != null && (
            <div className="flex items-start gap-2">
              <ClockIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Duration</span>
                <span className="text-gray-900 dark:text-white">{formatTime(song.duration)}</span>
              </div>
            </div>
          )}
          <div className="flex items-start gap-2">
            <CalendarIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div>
              <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Created</span>
              <span className="text-gray-900 dark:text-white">{formatDate(song.createdAt)}</span>
            </div>
          </div>
          {song.model && (
            <div className="flex items-start gap-2">
              <MusicalNoteIcon className="w-4 h-4 text-violet-400 mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Model</span>
                <span className="text-gray-900 dark:text-white">{song.model}</span>
              </div>
            </div>
          )}
          {rating.stars > 0 && (
            <div className="flex items-start gap-2">
              <span className="text-violet-400 mt-0.5 flex-shrink-0 text-sm">★</span>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Rating</span>
                <span className="text-yellow-400">{Array(rating.stars).fill("★").join("")}</span>
              </div>
            </div>
          )}
          {sunoJobId && (
            <div className="flex items-start gap-2 col-span-2">
              <span className="text-violet-400 mt-0.5 flex-shrink-0 text-xs font-mono">#</span>
              <div>
                <span className="text-gray-500 dark:text-gray-400 text-xs block uppercase tracking-wider">Suno ID</span>
                <span className="text-gray-900 dark:text-white font-mono text-xs">{sunoJobId}</span>
              </div>
            </div>
          )}
        </div>
      </div>

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

      {/* Action buttons row — primary | secondary groups */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Primary actions */}
        {hasAudio && (
          <DownloadButton song={song} />
        )}
        {hasAudio && (
          <button
            onClick={() =>
              isCached
                ? removeOffline(song.id)
                : saveOffline({ id: song.id, title: song.title, imageUrl: song.imageUrl ?? null })
            }
            disabled={isSavingOffline}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-all duration-200 active:scale-95 min-h-[44px] disabled:opacity-50 disabled:cursor-not-allowed ${
              isCached
                ? "bg-green-100 dark:bg-green-900/30 hover:bg-green-200 dark:hover:bg-green-900/50 text-green-700 dark:text-green-400"
                : "bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white"
            }`}
          >
            {isCached ? (
              <CheckCircleIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            ) : (
              <CloudArrowDownIcon className={`w-4 h-4 flex-shrink-0 ${isSavingOffline ? "animate-pulse" : ""}`} aria-hidden="true" />
            )}
            {isSavingOffline ? "Saving…" : isCached ? "Saved Offline" : "Save Offline"}
          </button>
        )}

        {/* Divider dot */}
        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-gray-700 hidden sm:block" aria-hidden="true" />

        {/* Secondary actions */}
        {/* Visibility toggle */}
        <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 min-h-[44px]">
          <ShareIcon className="w-4 h-4 flex-shrink-0 text-gray-500 dark:text-gray-400" aria-hidden="true" />
          <span className="text-sm font-medium text-gray-900 dark:text-white">
            {isPublic ? "Public" : "Private"}
          </span>
          <button
            role="switch"
            aria-checked={isPublic}
            aria-label={isPublic ? "Make song private" : "Make song public"}
            disabled={sharing}
            onClick={handleVisibilityToggle}
            className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 disabled:opacity-50 ${
              isPublic ? "bg-violet-600" : "bg-gray-300 dark:bg-gray-600"
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ${
                isPublic ? "translate-x-4" : "translate-x-0"
              }`}
            />
          </button>
        </div>
        {isPublic && (
          <button
            onClick={handleCopyLink}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 active:scale-95 min-h-[44px]"
          >
            <ShareIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            Share
          </button>
        )}
        {isPublic && (
          <button
            onClick={handleShareOnX}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 active:scale-95 min-h-[44px]"
            aria-label="Share on X (Twitter)"
          >
            <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.748l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
            Share on X
          </button>
        )}

        {/* Embed code button — only for public songs */}
        {isPublic && (
          <button
            onClick={() => setEmbedOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 active:scale-95 min-h-[44px]"
          >
            <CodeBracketIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
            Get Embed Code
          </button>
        )}

        {/* Queue actions */}
        {song.audioUrl && (
          <>
            <button
              onClick={() => {
                playNext({ id: song.id, title: song.title, audioUrl: song.audioUrl!, imageUrl: coverImageUrl ?? null, duration: song.duration ?? null, lyrics: song.lyrics });
                toast("Playing next", "success");
              }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 active:scale-95 min-h-[44px]"
            >
              <ForwardIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              Play Next
            </button>
            <button
              onClick={() => {
                addToQueue({ id: song.id, title: song.title, audioUrl: song.audioUrl!, imageUrl: coverImageUrl ?? null, duration: song.duration ?? null, lyrics: song.lyrics });
                toast("Added to queue", "success");
              }}
              className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-all duration-200 active:scale-95 min-h-[44px]"
            >
              <QueueListIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
              Add to Queue
            </button>
          </>
        )}

        {/* Add to playlist */}
        <AddToPlaylistButton songId={song.id} songTitle={song.title} variant="button" />

        {/* Report button */}
        <button
          onClick={() => setReportOpen(true)}
          className="flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl bg-gray-100 dark:bg-gray-800 hover:bg-red-100 dark:hover:bg-red-900/30 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-all duration-200 active:scale-95 min-h-[44px]"
          aria-label="Report song"
        >
          <FlagIcon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
          Report
        </button>
      </div>

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
              disabled={exports.mp4.status === "converting"}
              className="flex items-center justify-center gap-2 px-3 py-2.5 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors min-h-[44px]"
            >
              <FilmIcon className="w-4 h-4" aria-hidden="true" />
              {exports.mp4.status === "converting" ? "Generating..." : exports.mp4.status === "done" ? "Video Sent" : "Music Video"}
            </button>
          </div>
          {(exports.wav.status === "error" || exports.midi.status === "error" || exports.mp4.status === "error") && (
            <p className="text-xs text-red-400">
              {exports.wav.error || exports.midi.error || exports.mp4.error}
            </p>
          )}
        </div>
      )}

      {/* Cover art */}
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">Cover Art</h2>
        </div>
        <div className="flex items-center gap-3">
          {coverImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverImageUrl}
              alt="Cover art"
              className="w-14 h-14 rounded-xl object-cover border border-gray-200 dark:border-gray-700 flex-shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
              <MusicalNoteIcon className="w-6 h-6 text-gray-400 dark:text-gray-600" aria-hidden="true" />
            </div>
          )}
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
              onClick={() => setSeparateModalOpen(true)}
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
      {separateModalOpen && (
        <SeparateVocalsModal
          onClose={() => setSeparateModalOpen(false)}
          onSubmit={handleSeparateVocals}
          submitting={separateSubmitting}
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
      {stems.length > 0 && (
        <StemsPlayer stems={stems} onDownload={handleDownloadStem} onDownloadAll={handleDownloadAllStems} downloadingAll={downloadingAll} />
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
      {(song.lyrics || lyricsEdited) && (
        <LyricsEditor
          songId={song.id}
          originalLyrics={song.lyrics ?? null}
          editedLyrics={lyricsEdited}
          isCurrentSong={currentSong?.id === song.id}
        />
      )}

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
