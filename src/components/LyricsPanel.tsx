"use client";

import { useEffect, useRef } from "react";
import { XMarkIcon } from "@heroicons/react/24/solid";

interface LyricsPanelProps {
  lyrics: string;
  songTitle: string | null;
  onClose: () => void;
}

export function LyricsPanel({ lyrics, songTitle, onClose }: LyricsPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Close on click outside
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        onClose();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [onClose]);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="Lyrics"
      className="bg-gray-900/95 border border-gray-700 rounded-t-2xl shadow-2xl overflow-hidden w-full md:max-w-[600px] md:ml-auto animate-slide-in"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-700">
        <div>
          <h2 className="text-sm font-semibold text-white">Lyrics</h2>
          {songTitle && (
            <p className="text-xs text-gray-400 truncate max-w-[260px]">{songTitle}</p>
          )}
        </div>
        <button
          onClick={onClose}
          aria-label="Close lyrics"
          className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
        >
          <XMarkIcon className="w-5 h-5" />
        </button>
      </div>

      {/* Lyrics content */}
      <div className="max-h-[60vh] md:max-h-[60vh] overflow-y-auto px-4 py-4">
        <p className="text-sm text-gray-200 whitespace-pre-line leading-relaxed">
          {lyrics}
        </p>
      </div>
    </div>
  );
}
