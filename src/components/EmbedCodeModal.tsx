"use client";

import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";

interface EmbedCodeModalProps {
  songId: string;
  theme: "dark" | "light";
  autoplay: boolean;
  onThemeChange: (t: "dark" | "light") => void;
  onAutoplayChange: (v: boolean) => void;
  onClose: () => void;
}

export function EmbedCodeModal({
  songId,
  theme,
  autoplay,
  onThemeChange,
  onAutoplayChange,
  onClose,
}: EmbedCodeModalProps) {
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

        <div className="flex flex-wrap gap-4">
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

        <p className="text-xs text-gray-400 dark:text-gray-500">
          Paste this snippet into any HTML page to embed the player.
        </p>
      </div>
    </div>
  );
}
