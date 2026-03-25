"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { useSession } from "next-auth/react";
import { PlayIcon, XMarkIcon } from "@heroicons/react/24/solid";
import { useQueue, type QueueSong } from "./QueueContext";

interface SavedPlaybackState {
  songId: string;
  position: number;
  queue: QueueSong[];
  volume: number;
  song: {
    id: string;
    title: string | null;
    audioUrl: string | null;
    imageUrl: string | null;
    duration: number | null;
    lyrics: string | null;
  };
}

export function ResumePlaybackPrompt() {
  const { status } = useSession();
  const { playQueue, seek, setVolume } = useQueue();
  const [savedState, setSavedState] = useState<SavedPlaybackState | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") return;

    fetch("/api/user/playback-state")
      .then((r) => r.json())
      .then((data) => {
        if (data.state && data.state.song?.audioUrl) {
          setSavedState(data.state as SavedPlaybackState);
        }
      })
      .catch(() => {});
  }, [status]);

  if (!savedState || dismissed) return null;

  const { song, position } = savedState;
  const title = song.title ?? "Untitled";
  const minutes = Math.floor(position / 60);
  const seconds = Math.floor(position % 60);
  const positionLabel = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  function handleResume() {
    if (!savedState) return;
    const { song: s, queue: q, position: pos, volume: vol } = savedState;

    // Build the queue — make sure the saved song has a valid audioUrl
    const resumeQueue: QueueSong[] =
      Array.isArray(q) && q.length > 0
        ? q
        : [
            {
              id: s.id,
              title: s.title,
              audioUrl: s.audioUrl!,
              imageUrl: s.imageUrl,
              duration: s.duration,
              lyrics: s.lyrics,
            },
          ];

    const startIdx = resumeQueue.findIndex((item) => item.id === s.id);
    playQueue(resumeQueue, startIdx >= 0 ? startIdx : 0, "Resume");

    // Apply volume then seek after a short delay (audio needs to initialize)
    setVolume(typeof vol === "number" ? vol : 1);
    if (pos > 0) {
      setTimeout(() => seek(pos / (s.duration ?? pos)), 500);
    }

    setDismissed(true);
  }

  return (
    <div
      role="region"
      aria-label="Resume listening"
      className="mx-4 mt-3 flex items-center gap-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-900/20 px-4 py-3 shadow-sm"
    >
      {song.imageUrl ? (
        <Image
          src={song.imageUrl}
          alt=""
          width={40}
          height={40}
          className="rounded-lg object-cover flex-shrink-0"
        />
      ) : (
        <div className="h-10 w-10 rounded-lg bg-violet-200 dark:bg-violet-800 flex-shrink-0" />
      )}

      <div className="flex-1 min-w-0">
        <p className="text-xs text-violet-500 dark:text-violet-400 font-medium">
          Continue listening where you left off
        </p>
        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
          {title}
        </p>
        <p className="text-xs text-gray-500 dark:text-gray-400">{positionLabel}</p>
      </div>

      <button
        onClick={handleResume}
        aria-label={`Resume ${title}`}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium rounded-lg transition-colors flex-shrink-0"
      >
        <PlayIcon className="w-3.5 h-3.5" aria-hidden="true" />
        Resume
      </button>

      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
      >
        <XMarkIcon className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
