"use client";

import { useState, useRef, useCallback } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  PlayIcon,
  PauseIcon,
  MusicalNoteIcon,
  ArrowLeftIcon,
} from "@heroicons/react/24/solid";

interface CollectionSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  audioUrl: string | null;
  duration: number | null;
  rating: number | null;
  playCount: number;
  publicSlug: string | null;
  createdAt: string;
  user: { id: string; name: string | null; username: string | null };
}

interface CollectionDetail {
  id: string;
  title: string;
  description: string | null;
  coverImage: string | null;
  songCount: number;
  songs: CollectionSong[];
  createdAt: string;
}

const FALLBACK_IMAGE = "https://placehold.co/400x400/1e1b4b/a78bfa?text=♪";

function formatDuration(seconds: number | null): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function CollectionDetailView({ collection }: { collection: CollectionDetail }) {
  const [playingSongId, setPlayingSongId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const handlePlayToggle = useCallback(
    (id: string, audioUrl: string | null) => {
      if (playingSongId === id) {
        audioRef.current?.pause();
        setPlayingSongId(null);
        return;
      }
      if (audioRef.current) audioRef.current.pause();
      if (!audioUrl) return;
      const audio = new Audio(audioUrl);
      audio.volume = 0.7;
      audio.play().catch(() => {});
      audio.onended = () => setPlayingSongId(null);
      audioRef.current = audio;
      setPlayingSongId(id);
    },
    [playingSongId]
  );

  const cover = collection.coverImage ?? collection.songs[0]?.imageUrl ?? FALLBACK_IMAGE;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-white">
      {/* Hero */}
      <div className="relative bg-gradient-to-b from-violet-900 to-gray-950 pb-8">
        <div className="max-w-5xl mx-auto px-4 pt-6">
          <Link
            href="/discover?tab=collections"
            className="inline-flex items-center gap-1.5 text-sm text-violet-300 hover:text-white transition-colors mb-6"
          >
            <ArrowLeftIcon className="w-4 h-4" />
            Collections
          </Link>

          <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-end">
            {/* Cover */}
            <div className="relative w-40 h-40 rounded-xl overflow-hidden shadow-2xl shrink-0">
              <Image
                src={cover}
                alt={collection.title}
                fill
                sizes="160px"
                className="object-cover"
                priority
              />
            </div>

            {/* Meta */}
            <div>
              <p className="text-xs font-semibold text-violet-400 uppercase tracking-widest mb-1">
                Collection
              </p>
              <h1 className="text-3xl font-bold text-white mb-2">{collection.title}</h1>
              {collection.description && (
                <p className="text-sm text-gray-300 mb-3 max-w-xl">{collection.description}</p>
              )}
              <p className="text-xs text-gray-400">
                {collection.songCount} song{collection.songCount !== 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Song list */}
      <main className="max-w-5xl mx-auto px-4 py-8">
        {collection.songs.length === 0 ? (
          <div className="text-center py-16">
            <MusicalNoteIcon className="w-10 h-10 text-gray-300 dark:text-gray-700 mx-auto mb-3" />
            <p className="text-gray-500 dark:text-gray-400 text-sm">
              No songs in this collection yet.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {collection.songs.map((song, index) => {
              const isPlaying = playingSongId === song.id;
              const href = song.publicSlug
                ? `/songs/${song.publicSlug}`
                : `/songs/${song.id}`;
              const coverUrl = song.imageUrl ?? FALLBACK_IMAGE;
              const creator = song.user.name ?? song.user.username ?? "Unknown Artist";

              return (
                <div
                  key={song.id}
                  className="group flex items-center gap-4 p-3 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl hover:border-violet-400 dark:hover:border-violet-600 transition-colors"
                >
                  {/* Rank */}
                  <span className="w-6 text-center text-sm text-gray-400 dark:text-gray-500 shrink-0">
                    {index + 1}
                  </span>

                  {/* Cover + play */}
                  <div className="relative w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    <Link href={href}>
                      <Image
                        src={coverUrl}
                        alt={song.title || "Song cover"}
                        fill
                        sizes="48px"
                        className="object-cover"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                        {song.audioUrl && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handlePlayToggle(song.id, song.audioUrl);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity w-8 h-8 rounded-full bg-violet-600 hover:bg-violet-500 text-white flex items-center justify-center shadow min-h-[32px] min-w-[32px]"
                            aria-label={isPlaying ? "Pause" : "Play preview"}
                          >
                            {isPlaying ? (
                              <PauseIcon className="w-4 h-4" />
                            ) : (
                              <PlayIcon className="w-4 h-4 ml-0.5" />
                            )}
                          </button>
                        )}
                      </div>
                    </Link>
                    {isPlaying && (
                      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="flex gap-0.5">
                          <span className="w-0.5 h-3 bg-violet-400 rounded-full animate-pulse" />
                          <span className="w-0.5 h-2 bg-violet-400 rounded-full animate-pulse [animation-delay:150ms]" />
                          <span className="w-0.5 h-3.5 bg-violet-400 rounded-full animate-pulse [animation-delay:300ms]" />
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <Link href={href}>
                      <p className="text-sm font-semibold text-gray-900 dark:text-white truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors">
                        {song.title || "Untitled"}
                      </p>
                    </Link>
                    {song.user.username ? (
                      <Link
                        href={`/u/${song.user.username}`}
                        className="text-xs text-gray-500 dark:text-gray-400 truncate hover:text-violet-600 dark:hover:text-violet-400 transition-colors block"
                      >
                        {creator}
                      </Link>
                    ) : (
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{creator}</p>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0 space-y-0.5">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300">
                      {song.playCount.toLocaleString()} plays
                    </p>
                    {song.duration && (
                      <p className="text-[10px] text-gray-400 dark:text-gray-500">
                        {formatDuration(song.duration)}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
