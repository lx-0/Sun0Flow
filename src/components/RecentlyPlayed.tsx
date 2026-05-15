"use client";

import Link from "next/link";
import { PlayIcon, PauseIcon, MusicalNoteIcon, ClockIcon } from "@heroicons/react/24/solid";
import Image from "next/image";
import { useQueue, type QueueSong } from "./QueueContext";
import { useRecentlyPlayed, type RecentSong } from "@/hooks/useRecentlyPlayed";

export function RecentlyPlayed() {
  const { data: items = [], isPending: loading } = useRecentlyPlayed(20);

  const { queue, currentIndex, isPlaying, togglePlay } = useQueue();
  const currentSong = currentIndex >= 0 ? queue[currentIndex] : null;

  if (loading) {
    return (
      <section aria-label="Recently Played">
        <div className="flex items-center gap-2 mb-3">
          <ClockIcon className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Recently Played
          </h2>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              className="flex-shrink-0 w-28 animate-pulse"
            >
              <div className="w-28 h-28 rounded-xl bg-gray-200 dark:bg-gray-800 mb-2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-800 rounded w-3/4 mb-1" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  if (items.length === 0) return null;

  function handlePlay(song: RecentSong) {
    if (!song.audioUrl) return;
    const qs: QueueSong = {
      id: song.id,
      title: song.title,
      audioUrl: song.audioUrl,
      imageUrl: song.imageUrl,
      duration: song.duration,
      lyrics: song.lyrics,
    };
    togglePlay(qs);
  }

  return (
    <section aria-label="Recently Played" className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <ClockIcon className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
            Recently Played
          </h2>
        </div>
        <Link
          href="/history"
          className="text-xs text-violet-600 dark:text-violet-400 hover:underline"
        >
          See all
        </Link>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-700">
        {items.map((item) => {
          const song = item.song;
          const isCurrent = currentSong?.id === song.id;
          const isPlayable = !!song.audioUrl && song.generationStatus === "ready";

          return (
            <div key={item.id} className="flex-shrink-0 w-28 group">
              {/* Cover art with play overlay */}
              <div className="relative w-28 h-28 rounded-xl bg-gray-100 dark:bg-gray-800 overflow-hidden mb-2">
                {song.imageUrl ? (
                  <Image
                    src={song.imageUrl}
                    alt={song.title ?? "Song"}
                    fill
                    className="object-cover"
                    sizes="112px"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <MusicalNoteIcon className="w-8 h-8 text-gray-400" />
                  </div>
                )}
                {isPlayable && (
                  <button
                    onClick={() => handlePlay(song)}
                    aria-label={isCurrent && isPlaying ? "Pause" : `Play ${song.title ?? "song"}`}
                    className={`absolute inset-0 flex items-center justify-center transition-opacity ${
                      isCurrent
                        ? "opacity-100 bg-black/40"
                        : "opacity-0 group-hover:opacity-100 bg-black/40"
                    }`}
                  >
                    <div className="w-10 h-10 rounded-full bg-white/90 flex items-center justify-center shadow">
                      {isCurrent && isPlaying ? (
                        <PauseIcon className="w-5 h-5 text-gray-900" />
                      ) : (
                        <PlayIcon className="w-5 h-5 text-gray-900 ml-0.5" />
                      )}
                    </div>
                  </button>
                )}
              </div>

              {/* Title */}
              <Link
                href={`/library/${song.id}`}
                className="text-xs font-medium text-gray-800 dark:text-gray-200 hover:text-violet-600 dark:hover:text-violet-400 line-clamp-2 leading-tight transition-colors"
              >
                {song.title ?? "Untitled"}
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
