"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";

export type RemixAction = "extend" | "add-vocals" | "add-instrumental";

interface RemixModalProps {
  action: RemixAction;
  songTitle: string;
  songTags: string | null;
  songDuration: number | null;
  onClose: () => void;
  onSubmit: (action: RemixAction, data: Record<string, string | number | undefined>) => void;
  submitting: boolean;
}

export function RemixModal({ action, songTitle, songTags, songDuration, onClose, onSubmit, submitting }: RemixModalProps) {
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
