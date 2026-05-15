"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { MusicalNoteIcon } from "@heroicons/react/24/solid";

interface RecommendedSong {
  id: string;
  title: string | null;
  tags: string | null;
  imageUrl: string | null;
  duration: number | null;
  audioUrl: string | null;
  createdAt: string;
  rating?: number | null;
}

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function SongRow({ song }: { song: RecommendedSong }) {
  return (
    <Link
      href={`/library/${song.id}`}
      className="flex items-center gap-3 px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
    >
      <div className="relative w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex-shrink-0 flex items-center justify-center">
        {song.imageUrl ? (
          <Image
            src={song.imageUrl}
            alt={song.title ?? "Song"}
            fill
            className="object-cover"
            sizes="40px"
            loading="lazy"
          />
        ) : (
          <MusicalNoteIcon className="w-5 h-5 text-gray-400 dark:text-gray-600" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {song.title ?? "Untitled"}
        </p>
        {song.tags && (
          <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
            {song.tags.split(",")[0].trim()}
          </p>
        )}
      </div>
      {song.duration != null && (
        <span className="text-xs text-gray-400 flex-shrink-0">{formatTime(song.duration)}</span>
      )}
    </Link>
  );
}

function SongRowSkeleton() {
  return (
    <div className="flex items-center gap-3 px-3 py-3 animate-pulse">
      <div className="w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-700 flex-shrink-0" />
      <div className="flex-1 space-y-1.5">
        <div className="h-3.5 w-32 bg-gray-200 dark:bg-gray-700 rounded" />
        <div className="h-3 w-20 bg-gray-200 dark:bg-gray-700 rounded" />
      </div>
    </div>
  );
}

interface RecommendationSectionProps {
  songId: string;
  type: "similar" | "also-liked";
  title: string;
}

export function RecommendationSection({ songId, type, title }: RecommendationSectionProps) {
  const [songs, setSongs] = useState<RecommendedSong[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url =
      type === "similar"
        ? `/api/recommendations/similar?songId=${songId}&limit=5`
        : `/api/songs/${songId}/also-liked`;

    fetch(url)
      .then((r) => r.json())
      .then((data) => {
        setSongs(data.songs ?? []);
      })
      .catch(() => setSongs([]))
      .finally(() => setLoading(false));
  }, [songId, type]);

  if (!loading && (!songs || songs.length === 0)) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-shadow duration-200 hover:shadow-md">
      <div className="px-4 pt-4 pb-2">
        <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-300 tracking-wide">
          {title}
        </h2>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {loading ? (
          <>
            <SongRowSkeleton />
            <SongRowSkeleton />
            <SongRowSkeleton />
          </>
        ) : (
          songs!.map((song) => <SongRow key={song.id} song={song} />)
        )}
      </div>
    </div>
  );
}
