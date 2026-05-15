"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";

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

interface CreateVariationModalProps {
  sourceSong: { prompt: string | null; tags: string | null; lyrics: string | null; title: string | null; isInstrumental?: boolean };
  onClose: () => void;
  onSubmit: (data: { prompt: string; tags: string; lyrics: string; title: string; makeInstrumental: boolean }) => void;
  submitting: boolean;
}

export function CreateVariationModal({ sourceSong, onClose, onSubmit, submitting }: CreateVariationModalProps) {
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
