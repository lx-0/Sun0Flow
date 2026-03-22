"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import {
  ArrowUpTrayIcon,
  XMarkIcon,
  MusicalNoteIcon,
  SparklesIcon,
  MagnifyingGlassIcon,
} from "@heroicons/react/24/solid";
import { useToast } from "./Toast";
import { useGenerationPoller } from "@/hooks/useGenerationPoller";
import { GenerationProgress } from "./GenerationProgress";

type TrackSourceType = "library" | "upload" | "url";

interface LibrarySong {
  id: string;
  title: string | null;
  tags: string | null;
  audioUrl: string | null;
  imageUrl: string | null;
  duration: number | null;
}

interface TrackState {
  sourceType: TrackSourceType;
  // Library selection
  songId: string | null;
  songTitle: string | null;
  songImageUrl: string | null;
  // File upload
  file: File | null;
  previewUrl: string | null;
  duration: number | null;
  // URL
  fileUrl: string;
}

interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: string;
}

const ACCEPTED_TYPES = [
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/flac",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
];
const MAX_FILE_SIZE = 10 * 1024 * 1024;

function emptyTrack(): TrackState {
  return {
    sourceType: "library",
    songId: null,
    songTitle: null,
    songImageUrl: null,
    file: null,
    previewUrl: null,
    duration: null,
    fileUrl: "",
  };
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

// --- Song Picker Modal ---

function SongPickerModal({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (song: LibrarySong) => void;
}) {
  const [songs, setSongs] = useState<LibrarySong[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch("/api/songs?status=ready&limit=100")
      .then((r) => r.json())
      .then((data) => {
        setSongs(data.songs ?? data ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = songs.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      (s.title && s.title.toLowerCase().includes(q)) ||
      (s.tags && s.tags.toLowerCase().includes(q))
    );
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-full max-w-lg max-h-[70vh] bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
            Pick a song from your library
          </h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-2">
          <div className="relative">
            <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search songs..."
              className="w-full pl-9 pr-4 py-2 rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Song list */}
        <div className="flex-1 overflow-y-auto px-2 pb-2">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <svg
                className="animate-spin h-6 w-6 text-violet-500"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 py-8">
              {search.trim()
                ? "No songs match your search"
                : "No completed songs in your library"}
            </p>
          ) : (
            <div className="space-y-1">
              {filtered.map((song) => (
                <button
                  key={song.id}
                  type="button"
                  onClick={() => {
                    onSelect(song);
                    onClose();
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left hover:bg-violet-50 dark:hover:bg-violet-900/20 transition-colors"
                >
                  {song.imageUrl ? (
                    <img
                      src={song.imageUrl}
                      alt=""
                      className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className="h-10 w-10 rounded-lg bg-gray-100 dark:bg-gray-800 flex items-center justify-center flex-shrink-0">
                      <MusicalNoteIcon className="h-5 w-5 text-gray-400" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {song.title || "Untitled"}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                      {song.tags || "No tags"}
                      {song.duration != null &&
                        ` · ${formatDuration(song.duration)}`}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// --- Track Selector ---

function TrackSelector({
  label,
  track,
  onChange,
}: {
  label: string;
  track: TrackState;
  onChange: (t: TrackState) => void;
}) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  const handleFileSelect = useCallback(
    (selectedFile: File) => {
      if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
        toast(
          "Unsupported file type. Please upload an audio file (MP3, WAV, OGG, FLAC, M4A).",
          "error"
        );
        return;
      }
      if (selectedFile.size > MAX_FILE_SIZE) {
        toast("File too large (max 10MB). Try using a URL instead.", "error");
        return;
      }

      const url = URL.createObjectURL(selectedFile);
      const audio = new Audio(url);
      audio.addEventListener("loadedmetadata", () => {
        onChange({
          ...emptyTrack(),
          sourceType: "upload",
          file: selectedFile,
          previewUrl: url,
          duration: audio.duration,
        });
      });
      audio.addEventListener("error", () => {
        onChange({
          ...emptyTrack(),
          sourceType: "upload",
          file: selectedFile,
          previewUrl: url,
          duration: null,
        });
      });
    },
    [onChange, toast]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const clearTrack = useCallback(() => {
    if (track.previewUrl) URL.revokeObjectURL(track.previewUrl);
    onChange(emptyTrack());
  }, [track.previewUrl, onChange]);

  const hasSelection =
    track.songId || track.file || track.fileUrl.trim();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
          {label}
        </label>
        {hasSelection && (
          <button
            type="button"
            onClick={clearTrack}
            className="text-xs text-gray-500 dark:text-gray-400 hover:text-red-500 dark:hover:text-red-400"
          >
            Clear
          </button>
        )}
      </div>

      {/* Source type tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
        {(["library", "upload", "url"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => {
              if (type !== track.sourceType) {
                clearTrack();
                onChange({ ...emptyTrack(), sourceType: type });
              }
            }}
            className={`flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
              track.sourceType === type
                ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {type === "library"
              ? "Library"
              : type === "upload"
                ? "Upload"
                : "URL"}
          </button>
        ))}
      </div>

      {/* Library source */}
      {track.sourceType === "library" && (
        <>
          {track.songId ? (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 flex items-center gap-3">
              {track.songImageUrl ? (
                <img
                  src={track.songImageUrl}
                  alt=""
                  className="h-10 w-10 rounded-lg object-cover flex-shrink-0"
                />
              ) : (
                <div className="h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center flex-shrink-0">
                  <MusicalNoteIcon className="h-5 w-5 text-violet-500" />
                </div>
              )}
              <p className="text-sm font-medium text-gray-900 dark:text-white truncate flex-1">
                {track.songTitle || "Untitled"}
              </p>
              <button
                type="button"
                onClick={() => setPickerOpen(true)}
                className="text-xs text-violet-600 dark:text-violet-400 hover:underline flex-shrink-0"
              >
                Change
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              className="w-full flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-violet-400 dark:hover:border-violet-500 bg-gray-50 dark:bg-gray-800/50 transition-colors"
            >
              <MusicalNoteIcon className="h-6 w-6 text-gray-400 dark:text-gray-500" />
              <span className="text-sm text-gray-600 dark:text-gray-400">
                Choose from library
              </span>
            </button>
          )}
          <SongPickerModal
            open={pickerOpen}
            onClose={() => setPickerOpen(false)}
            onSelect={(song) =>
              onChange({
                ...emptyTrack(),
                sourceType: "library",
                songId: song.id,
                songTitle: song.title,
                songImageUrl: song.imageUrl,
              })
            }
          />
        </>
      )}

      {/* Upload source */}
      {track.sourceType === "upload" && (
        <>
          {!track.file ? (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsDragging(false);
              }}
              onClick={() => fileInputRef.current?.click()}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ")
                  fileInputRef.current?.click();
              }}
              className={`flex flex-col items-center justify-center gap-2 p-6 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                isDragging
                  ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                  : "border-gray-300 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500 bg-gray-50 dark:bg-gray-800/50"
              }`}
            >
              <ArrowUpTrayIcon
                className={`h-6 w-6 ${
                  isDragging
                    ? "text-violet-500"
                    : "text-gray-400 dark:text-gray-500"
                }`}
              />
              <div className="text-center">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Drop audio file or click to browse
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  MP3, WAV, OGG, FLAC, M4A (max 10MB)
                </p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
                className="hidden"
              />
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-3 space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <MusicalNoteIcon className="h-5 w-5 text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {track.file.name}
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatFileSize(track.file.size)}
                    {track.duration != null &&
                      ` · ${formatDuration(track.duration)}`}
                  </p>
                </div>
              </div>
              {track.previewUrl && (
                <audio
                  src={track.previewUrl}
                  controls
                  className="w-full h-8"
                  preload="metadata"
                />
              )}
            </div>
          )}
        </>
      )}

      {/* URL source */}
      {track.sourceType === "url" && (
        <input
          type="url"
          value={track.fileUrl}
          onChange={(e) => onChange({ ...track, fileUrl: e.target.value })}
          placeholder="https://example.com/song.mp3"
          className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
        />
      )}
    </div>
  );
}

// --- File to Base64 ---

function fileToBase64(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(f);
  });
}

// --- Build track payload ---

async function buildTrackPayload(track: TrackState) {
  if (track.sourceType === "library" && track.songId) {
    return { songId: track.songId };
  }
  if (track.sourceType === "upload" && track.file) {
    const base64Data = await fileToBase64(track.file);
    return { base64Data };
  }
  if (track.sourceType === "url" && track.fileUrl.trim()) {
    return { fileUrl: track.fileUrl.trim() };
  }
  return null;
}

// --- Main Component ---

export function MashupStudio() {
  const { toast } = useToast();
  const { songs: trackedSongs, trackSong, clearAll } = useGenerationPoller();

  const [trackA, setTrackA] = useState<TrackState>(emptyTrack());
  const [trackB, setTrackB] = useState<TrackState>(emptyTrack());
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);

  // Fetch rate limit on mount
  const rateLimitFetched = useRef(false);
  if (!rateLimitFetched.current) {
    rateLimitFetched.current = true;
    fetch("/api/rate-limit/status")
      .then((r) => r.json())
      .then((d) => setRateLimit(d))
      .catch(() => {});
  }

  const trackAReady =
    (trackA.sourceType === "library" && trackA.songId) ||
    (trackA.sourceType === "upload" && trackA.file) ||
    (trackA.sourceType === "url" && trackA.fileUrl.trim());

  const trackBReady =
    (trackB.sourceType === "library" && trackB.songId) ||
    (trackB.sourceType === "upload" && trackB.file) ||
    (trackB.sourceType === "url" && trackB.fileUrl.trim());

  const rateLimitExhausted = rateLimit && rateLimit.remaining <= 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!trackAReady || !trackBReady) {
      toast("Please select two tracks for the mashup.", "error");
      return;
    }

    setSubmitting(true);

    try {
      const [payloadA, payloadB] = await Promise.all([
        buildTrackPayload(trackA),
        buildTrackPayload(trackB),
      ]);

      if (!payloadA || !payloadB) {
        toast("Could not prepare track data. Please try again.", "error");
        setSubmitting(false);
        return;
      }

      const res = await fetch("/api/mashup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          trackA: payloadA,
          trackB: payloadB,
          title: title.trim() || undefined,
          prompt: prompt.trim() || undefined,
          style: style.trim() || undefined,
          instrumental,
        }),
      });

      const data = await res.json();

      if (data.rateLimit) setRateLimit(data.rateLimit);

      if (!res.ok && res.status !== 201) {
        toast(data.error || "Mashup generation failed", "error");
        setSubmitting(false);
        return;
      }

      if (data.error) {
        toast(data.error, "error");
      } else {
        toast("Mashup generation started!", "success");
      }

      if (data.songs?.length) {
        for (const song of data.songs) {
          trackSong(song.id, song.title);
        }
      }

      setSubmitting(false);
    } catch {
      toast("Failed to start mashup. Please try again.", "error");
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 space-y-6">
      <div>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Mashup Studio
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Blend two songs together into a new creation
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Track selectors side by side on desktop */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TrackSelector
            label="Track A"
            track={trackA}
            onChange={setTrackA}
          />
          <TrackSelector
            label="Track B"
            track={trackB}
            onChange={setTrackB}
          />
        </div>

        {/* Generation options */}
        <div className="space-y-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4">
          <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
            Mashup options
          </h2>

          <div>
            <label
              htmlFor="mashup-title"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Title (optional)
            </label>
            <input
              id="mashup-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Name your mashup"
              maxLength={200}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="mashup-style"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Style / Genre (optional)
            </label>
            <input
              id="mashup-style"
              type="text"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              placeholder='e.g. "electronic dance", "lo-fi chill"'
              maxLength={200}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          <div>
            <label
              htmlFor="mashup-prompt"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Lyrics / Prompt (optional)
            </label>
            <textarea
              id="mashup-prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              rows={3}
              placeholder="Describe how the mashup should sound or add custom lyrics"
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={instrumental}
              onChange={(e) => setInstrumental(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm text-gray-700 dark:text-gray-300">
              Instrumental (no vocals)
            </span>
          </label>
        </div>

        {/* Rate limit */}
        {rateLimit && (
          <div
            className={`text-xs px-3 py-2 rounded-lg ${
              rateLimitExhausted
                ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
                : rateLimit.remaining <= Math.ceil(rateLimit.limit * 0.2)
                  ? "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400"
                  : "bg-gray-50 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            }`}
          >
            {rateLimitExhausted
              ? `Rate limit reached. Resets at ${new Date(rateLimit.resetAt).toLocaleTimeString()}.`
              : `${rateLimit.remaining}/${rateLimit.limit} generations remaining this hour`}
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={
            submitting ||
            !!rateLimitExhausted ||
            !trackAReady ||
            !trackBReady
          }
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-medium py-3 px-6 rounded-xl transition-colors disabled:cursor-not-allowed"
        >
          {submitting ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Creating mashup...
            </>
          ) : (
            <>
              <SparklesIcon className="h-4 w-4" />
              Generate Mashup
            </>
          )}
        </button>
      </form>

      {/* Generation progress */}
      <GenerationProgress songs={trackedSongs} onDismiss={clearAll} />
    </div>
  );
}
