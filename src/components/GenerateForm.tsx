"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SparklesIcon } from "@heroicons/react/24/solid";

export function GenerateForm() {
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [stylePrompt, setStylePrompt] = useState("");
  const [customMode, setCustomMode] = useState(false);
  const [lyrics, setLyrics] = useState("");
  const [instrumental, setInstrumental] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setSuccessMsg(null);
    setIsSubmitting(true);

    try {
      const body = {
        prompt: customMode ? lyrics : stylePrompt,
        title: title || undefined,
        tags: stylePrompt || undefined,
        makeInstrumental: instrumental,
      };

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Generation failed. Please try again.");
        return;
      }

      setSuccessMsg("Song queued! Redirecting to your library…");
      setTimeout(() => router.push("/library"), 1500);
    } catch {
      setError("Network error. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="px-4 py-4 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold text-white">Generate</h1>
        <p className="text-gray-400 text-sm mt-0.5">Create a new song with AI</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Title */}
        <div className="space-y-1">
          <label htmlFor="title" className="block text-sm font-medium text-gray-300">
            Song title <span className="text-gray-500">(optional)</span>
          </label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="My awesome song"
            disabled={isSubmitting}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {/* Style / Genre prompt */}
        <div className="space-y-1">
          <label htmlFor="stylePrompt" className="block text-sm font-medium text-gray-300">
            Style / genre
          </label>
          <input
            id="stylePrompt"
            type="text"
            value={stylePrompt}
            onChange={(e) => setStylePrompt(e.target.value)}
            placeholder="e.g. upbeat lo-fi hip-hop, melancholic indie folk…"
            required={!customMode}
            disabled={isSubmitting}
            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent disabled:opacity-50"
          />
        </div>

        {/* Custom lyrics toggle */}
        <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-gray-300">Custom lyrics</span>
          <button
            type="button"
            role="switch"
            aria-checked={customMode}
            onClick={() => setCustomMode((v) => !v)}
            disabled={isSubmitting}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 ${
              customMode ? "bg-violet-600" : "bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                customMode ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Lyrics textarea — shown only in custom mode */}
        {customMode && (
          <div className="space-y-1">
            <label htmlFor="lyrics" className="block text-sm font-medium text-gray-300">
              Lyrics
            </label>
            <textarea
              id="lyrics"
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="[Verse 1]&#10;Your lyrics here…&#10;&#10;[Chorus]&#10;…"
              rows={8}
              required={customMode}
              disabled={isSubmitting}
              className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent resize-none disabled:opacity-50"
            />
          </div>
        )}

        {/* Instrumental toggle */}
        <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-xl px-4 py-3">
          <span className="text-sm font-medium text-gray-300">Instrumental only</span>
          <button
            type="button"
            role="switch"
            aria-checked={instrumental}
            onClick={() => setInstrumental((v) => !v)}
            disabled={isSubmitting}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-gray-900 disabled:opacity-50 ${
              instrumental ? "bg-violet-600" : "bg-gray-600"
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                instrumental ? "translate-x-6" : "translate-x-1"
              }`}
            />
          </button>
        </div>

        {/* Error message */}
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Success message */}
        {successMsg && (
          <div className="bg-green-900/30 border border-green-700 rounded-xl px-4 py-3">
            <p className="text-sm text-green-400">{successMsg}</p>
          </div>
        )}

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-violet-600 hover:bg-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold rounded-xl px-4 py-3 transition-colors min-h-[52px]"
        >
          {isSubmitting ? (
            <>
              <svg
                className="animate-spin h-5 w-5 text-white"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
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
              Generating…
            </>
          ) : (
            <>
              <SparklesIcon className="h-5 w-5" />
              Generate
            </>
          )}
        </button>
      </form>
    </div>
  );
}
