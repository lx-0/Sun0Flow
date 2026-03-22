"use client";

import { useState, useRef, useCallback } from "react";
import {
  ArrowUpTrayIcon,
  XMarkIcon,
  MusicalNoteIcon,
  SparklesIcon,
} from "@heroicons/react/24/solid";
import { useToast } from "./Toast";
import { useGenerationPoller } from "@/hooks/useGenerationPoller";
import { GenerationProgress } from "./GenerationProgress";

type UploadMode = "cover" | "extend";
type UploadStep = "idle" | "uploading" | "generating";

interface RateLimitStatus {
  remaining: number;
  limit: number;
  resetAt: string;
}

const ACCEPTED_TYPES = ["audio/mpeg", "audio/wav", "audio/ogg", "audio/flac", "audio/mp4", "audio/x-m4a", "audio/aac"];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB for base64

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

export function AudioUploadForm() {
  const { toast } = useToast();
  const { songs: trackedSongs, trackSong, clearAll } = useGenerationPoller();

  // Upload state
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState("");
  const [useUrl, setUseUrl] = useState(false);
  const [audioDuration, setAudioDuration] = useState<number | null>(null);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Generation params
  const [mode, setMode] = useState<UploadMode>("cover");
  const [title, setTitle] = useState("");
  const [style, setStyle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [continueAt, setContinueAt] = useState("");

  // UI state
  const [step, setStep] = useState<UploadStep>("idle");
  const [rateLimit, setRateLimit] = useState<RateLimitStatus | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  // Fetch rate limit on mount
  const rateLimitFetched = useRef(false);
  if (!rateLimitFetched.current) {
    rateLimitFetched.current = true;
    fetch("/api/rate-limit/status")
      .then((r) => r.json())
      .then((d) => setRateLimit(d))
      .catch(() => {});
  }

  const handleFileSelect = useCallback((selectedFile: File) => {
    if (!ACCEPTED_TYPES.includes(selectedFile.type)) {
      toast("Unsupported file type. Please upload an audio file (MP3, WAV, OGG, FLAC, M4A).", "error");
      return;
    }
    if (selectedFile.size > MAX_FILE_SIZE) {
      toast("File too large for upload (max 10MB). Try using a URL instead.", "error");
      return;
    }

    setFile(selectedFile);
    setUseUrl(false);
    setFileUrl("");

    // Create preview URL and get duration
    const url = URL.createObjectURL(selectedFile);
    setAudioPreviewUrl(url);

    const audio = new Audio(url);
    audio.addEventListener("loadedmetadata", () => {
      setAudioDuration(audio.duration);
    });
    audio.addEventListener("error", () => {
      setAudioDuration(null);
    });
  }, [toast]);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) handleFileSelect(droppedFile);
    },
    [handleFileSelect]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const clearFile = useCallback(() => {
    setFile(null);
    if (audioPreviewUrl) URL.revokeObjectURL(audioPreviewUrl);
    setAudioPreviewUrl(null);
    setAudioDuration(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, [audioPreviewUrl]);

  const fileToBase64 = (f: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Strip the data URL prefix (e.g. "data:audio/mpeg;base64,")
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!file && !fileUrl.trim()) {
      toast("Please upload a file or provide a URL.", "error");
      return;
    }

    setStep("uploading");

    try {
      const payload: Record<string, unknown> = {
        mode,
        title: title.trim() || undefined,
        prompt: prompt.trim() || undefined,
        style: style.trim() || undefined,
        instrumental,
      };

      if (mode === "extend" && continueAt.trim()) {
        payload.continueAt = parseFloat(continueAt);
      }

      if (file) {
        setStep("uploading");
        const base64 = await fileToBase64(file);
        payload.base64Data = base64;
      } else {
        payload.fileUrl = fileUrl.trim();
      }

      setStep("generating");

      const res = await fetch("/api/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.rateLimit) setRateLimit(data.rateLimit);

      if (!res.ok && res.status !== 201) {
        toast(data.error || "Upload failed", "error");
        setStep("idle");
        return;
      }

      if (data.error) {
        toast(data.error, "error");
      } else {
        toast(`${mode === "cover" ? "Cover" : "Extension"} generation started!`, "success");
      }

      // Track generation progress
      if (data.songs?.length) {
        for (const song of data.songs) {
          trackSong(song.id, song.title);
        }
      }

      setStep("idle");
    } catch {
      toast("Failed to upload. Please try again.", "error");
      setStep("idle");
    }
  };

  const isSubmitting = step !== "idle";
  const rateLimitExhausted = rateLimit && rateLimit.remaining <= 0;

  return (
    <div className="space-y-6">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Mode selector */}
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setMode("cover")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors ${
              mode === "cover"
                ? "bg-violet-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Cover
          </button>
          <button
            type="button"
            onClick={() => setMode("extend")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-colors ${
              mode === "extend"
                ? "bg-violet-600 text-white"
                : "bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
            }`}
          >
            Extend
          </button>
        </div>

        {/* Upload zone / URL toggle */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Audio source
            </label>
            <button
              type="button"
              onClick={() => {
                setUseUrl(!useUrl);
                if (!useUrl) clearFile();
              }}
              className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
            >
              {useUrl ? "Upload file instead" : "Use URL instead"}
            </button>
          </div>

          {useUrl ? (
            <input
              type="url"
              value={fileUrl}
              onChange={(e) => setFileUrl(e.target.value)}
              placeholder="https://example.com/song.mp3"
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          ) : (
            <>
              {/* Drop zone */}
              {!file ? (
                <div
                  onDrop={handleDrop}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onClick={() => fileInputRef.current?.click()}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") fileInputRef.current?.click();
                  }}
                  className={`flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
                    isDragging
                      ? "border-violet-500 bg-violet-50 dark:bg-violet-900/20"
                      : "border-gray-300 dark:border-gray-600 hover:border-violet-400 dark:hover:border-violet-500 bg-gray-50 dark:bg-gray-800/50"
                  }`}
                >
                  <ArrowUpTrayIcon
                    className={`h-8 w-8 ${
                      isDragging
                        ? "text-violet-500"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  />
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                      Drop audio file here or click to browse
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
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
                /* File preview */
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0 h-10 w-10 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                      <MusicalNoteIcon className="h-5 w-5 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {file.name}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {formatFileSize(file.size)}
                        {audioDuration != null &&
                          ` \u00B7 ${formatDuration(audioDuration)}`}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={clearFile}
                      className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <XMarkIcon className="h-4 w-4 text-gray-500" />
                    </button>
                  </div>

                  {/* Audio preview player */}
                  {audioPreviewUrl && (
                    <audio
                      ref={audioRef}
                      src={audioPreviewUrl}
                      controls
                      className="w-full h-10"
                      preload="metadata"
                    />
                  )}
                </div>
              )}
            </>
          )}
        </div>

        {/* Title */}
        <div>
          <label
            htmlFor="upload-title"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Title (optional)
          </label>
          <input
            id="upload-title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Give your song a name"
            maxLength={200}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>

        {/* Style */}
        <div>
          <label
            htmlFor="upload-style"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Style / Genre
          </label>
          <input
            id="upload-style"
            type="text"
            value={style}
            onChange={(e) => setStyle(e.target.value)}
            placeholder={
              mode === "cover"
                ? 'e.g. "jazz piano", "electronic remix"'
                : 'e.g. "ambient outro", "rock crescendo"'
            }
            maxLength={200}
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
        </div>

        {/* Lyrics / Prompt */}
        <div>
          <label
            htmlFor="upload-prompt"
            className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
          >
            Lyrics / Prompt (optional)
          </label>
          <textarea
            id="upload-prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={4}
            placeholder={
              mode === "cover"
                ? "Custom lyrics for the cover version"
                : "Describe how the song should continue"
            }
            className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none"
          />
        </div>

        {/* Extend-only: Continue At */}
        {mode === "extend" && (
          <div>
            <label
              htmlFor="continue-at"
              className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1"
            >
              Continue at (seconds, optional)
            </label>
            <input
              id="continue-at"
              type="number"
              value={continueAt}
              onChange={(e) => setContinueAt(e.target.value)}
              placeholder={
                audioDuration != null
                  ? `0 - ${Math.floor(audioDuration)}`
                  : "e.g. 120"
              }
              min={0}
              max={audioDuration ?? undefined}
              step={1}
              className="w-full rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Where in the track to start the extension. Leave empty for the
              end.
            </p>
          </div>
        )}

        {/* Instrumental toggle */}
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

        {/* Rate limit warning */}
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
            isSubmitting ||
            !!rateLimitExhausted ||
            (!file && !fileUrl.trim())
          }
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:bg-gray-400 dark:disabled:bg-gray-600 text-white font-medium py-3 px-6 rounded-xl transition-colors disabled:cursor-not-allowed"
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
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
              {step === "uploading" ? "Uploading..." : "Generating..."}
            </>
          ) : (
            <>
              <SparklesIcon className="h-4 w-4" />
              {mode === "cover"
                ? "Generate Cover"
                : "Generate Extension"}
            </>
          )}
        </button>
      </form>

      {/* Generation progress */}
      <GenerationProgress songs={trackedSongs} onDismiss={clearAll} />
    </div>
  );
}
