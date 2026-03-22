"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  PlayIcon,
  PauseIcon,
  MusicalNoteIcon,
  TrashIcon,
  ArrowLeftIcon,
  Bars3Icon,
  PencilIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon as PlaySolidIcon } from "@heroicons/react/24/solid";
import type { Song } from "@prisma/client";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";

function formatTime(seconds: number): string {
  if (!seconds || isNaN(seconds) || !isFinite(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function songToQueueSong(song: Song): QueueSong | null {
  if (!song.audioUrl) return null;
  return {
    id: song.id,
    title: song.title,
    audioUrl: song.audioUrl,
    imageUrl: song.imageUrl,
    duration: song.duration,
  };
}

interface PlaylistSongItem {
  id: string;
  songId: string;
  position: number;
  song: Song;
}

interface PlaylistData {
  id: string;
  name: string;
  description: string | null;
  songs: PlaylistSongItem[];
  _count: { songs: number };
}

export function PlaylistDetailView({
  playlist: initialPlaylist,
}: {
  playlist: PlaylistData;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const {
    queue,
    currentIndex,
    isPlaying,
    togglePlay,
    playQueue,
  } = useQueue();

  const currentSongId = currentIndex >= 0 ? queue[currentIndex]?.id ?? null : null;

  const [playlist, setPlaylist] = useState(initialPlaylist);
  const [songs, setSongs] = useState(initialPlaylist.songs);
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(initialPlaylist.name);
  const [editDesc, setEditDesc] = useState(initialPlaylist.description || "");
  const [saving, setSaving] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Drag state
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  function buildPlaylistQueue(): QueueSong[] {
    return songs
      .map((ps) => songToQueueSong(ps.song))
      .filter((s): s is QueueSong => s !== null);
  }

  function handleTogglePlay(song: Song) {
    const qs = songToQueueSong(song);
    if (!qs) return;

    if (currentSongId === song.id) {
      togglePlay(qs);
      return;
    }

    // Build queue from playlist songs and start at clicked song
    const queueSongs = buildPlaylistQueue();
    const idx = queueSongs.findIndex((s) => s.id === song.id);
    playQueue(queueSongs, idx >= 0 ? idx : 0);
  }

  function handlePlayAll() {
    const queueSongs = buildPlaylistQueue();
    if (queueSongs.length > 0) {
      playQueue(queueSongs, 0);
    }
  }

  const handleRemoveSong = useCallback(
    async (songId: string) => {
      // Optimistic removal
      setSongs((prev) => prev.filter((ps) => ps.songId !== songId));

      try {
        const res = await fetch(
          `/api/playlists/${playlist.id}/songs/${songId}`,
          { method: "DELETE" }
        );
        if (!res.ok) {
          setSongs(songs);
          toast("Failed to remove song", "error");
          return;
        }
        toast("Song removed", "success");
      } catch {
        setSongs(songs);
        toast("Failed to remove song", "error");
      }
    },
    [playlist.id, songs, toast]
  );

  // Drag and drop reorder
  function handleDragStart(index: number) {
    setDragIndex(index);
  }

  function handleDragOver(e: React.DragEvent, index: number) {
    e.preventDefault();
    setDragOverIndex(index);
  }

  async function handleDrop(e: React.DragEvent, dropIndex: number) {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }

    const reordered = [...songs];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);

    setSongs(reordered);
    setDragIndex(null);
    setDragOverIndex(null);

    try {
      const res = await fetch(`/api/playlists/${playlist.id}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          songIds: reordered.map((ps) => ps.songId),
        }),
      });
      if (!res.ok) {
        setSongs(songs);
        toast("Failed to reorder", "error");
      }
    } catch {
      setSongs(songs);
      toast("Failed to reorder", "error");
    }
  }

  async function handleSaveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim() || saving) return;

    setSaving(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: editName.trim(),
          description: editDesc.trim() || null,
        }),
      });
      if (!res.ok) {
        toast("Failed to update playlist", "error");
        return;
      }
      const data = await res.json();
      setPlaylist((prev) => ({ ...prev, ...data.playlist }));
      setEditing(false);
      toast("Playlist updated", "success");
    } catch {
      toast("Failed to update playlist", "error");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setShowDeleteConfirm(false);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast("Failed to delete playlist", "error");
        return;
      }
      toast("Playlist deleted", "success");
      router.push("/playlists");
    } catch {
      toast("Failed to delete playlist", "error");
    }
  }

  const totalDuration = songs.reduce(
    (sum, ps) => sum + (ps.song.duration ?? 0),
    0
  );

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Back link */}
      <Link
        href="/playlists"
        className="inline-flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400 hover:text-violet-400 transition-colors"
      >
        <ArrowLeftIcon className="w-4 h-4" />
        Playlists
      </Link>

      {/* Header */}
      {editing ? (
        <form onSubmit={handleSaveEdit} className="space-y-3">
          <input
            type="text"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={100}
            autoFocus
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <input
            type="text"
            value={editDesc}
            onChange={(e) => setEditDesc(e.target.value)}
            placeholder="Description (optional)"
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!editName.trim() || saving}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setEditName(playlist.name);
                setEditDesc(playlist.description || "");
              }}
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {playlist.name}
            </h1>
            {playlist.description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {playlist.description}
              </p>
            )}
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-0.5">
              {songs.length} song{songs.length !== 1 ? "s" : ""}
              {totalDuration > 0 && ` · ${formatTime(totalDuration)}`}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setEditing(true)}
              aria-label="Edit playlist"
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-violet-400 transition-colors"
            >
              <PencilIcon className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowDeleteConfirm(true)}
              aria-label="Delete playlist"
              className="w-11 h-11 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
            >
              <TrashIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Play all button */}
      {songs.length > 0 && !editing && (
        <button
          onClick={handlePlayAll}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors min-h-[44px]"
        >
          <PlaySolidIcon className="w-4 h-4" />
          Play All
        </button>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteConfirm && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900 rounded-xl p-4 space-y-3">
          <p className="text-sm text-red-700 dark:text-red-300">
            Delete &ldquo;{playlist.name}&rdquo;? This cannot be undone.
          </p>
          <div className="flex gap-2">
            <button
              onClick={handleDelete}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 text-white transition-colors min-h-[44px]"
            >
              Delete
            </button>
            <button
              onClick={() => setShowDeleteConfirm(false)}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Song list */}
      {songs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
          <p className="text-gray-500 text-sm">
            No songs in this playlist yet. Add songs from your library.
          </p>
        </div>
      ) : (
        <ul className="space-y-1">
          {songs.map((ps, index) => {
            const isActive = currentSongId === ps.songId;
            const hasAudio = Boolean(ps.song.audioUrl);
            const isDragOver = dragOverIndex === index;

            return (
              <li
                key={ps.id}
                draggable
                onDragStart={() => handleDragStart(index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onDragEnd={() => {
                  setDragIndex(null);
                  setDragOverIndex(null);
                }}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${
                  isActive
                    ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-300 dark:border-violet-700"
                    : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                } ${isDragOver ? "border-violet-400 dark:border-violet-500" : ""} ${
                  dragIndex === index ? "opacity-50" : ""
                }`}
              >
                {/* Drag handle */}
                <div className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600">
                  <Bars3Icon className="w-5 h-5" />
                </div>

                {/* Position number */}
                <span className="flex-shrink-0 w-6 text-xs text-gray-400 dark:text-gray-500 text-center">
                  {index + 1}
                </span>

                {/* Cover art */}
                <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                  {ps.song.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={ps.song.imageUrl}
                      alt={ps.song.title ?? "Song"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <MusicalNoteIcon className="w-5 h-5 text-gray-400 dark:text-gray-600" />
                  )}
                </div>

                {/* Title + duration */}
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/library/${ps.songId}`}
                    className="block text-sm font-medium text-gray-900 dark:text-white truncate hover:text-violet-400 transition-colors"
                  >
                    {ps.song.title ?? "Untitled"}
                  </Link>
                  {ps.song.duration && (
                    <span className="text-xs text-gray-400 dark:text-gray-500">
                      {formatTime(ps.song.duration)}
                    </span>
                  )}
                </div>

                {/* Play button */}
                <button
                  onClick={() => handleTogglePlay(ps.song)}
                  disabled={!hasAudio}
                  aria-label={
                    isActive && isPlaying ? "Pause" : "Play"
                  }
                  className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center transition-colors ${
                    hasAudio
                      ? "bg-violet-600 hover:bg-violet-500 text-white"
                      : "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                  }`}
                >
                  {isActive && isPlaying ? (
                    <PauseIcon className="w-4 h-4" />
                  ) : (
                    <PlayIcon className="w-4 h-4 ml-0.5" />
                  )}
                </button>

                {/* Remove button */}
                <button
                  onClick={() => handleRemoveSong(ps.songId)}
                  aria-label="Remove from playlist"
                  className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                >
                  <TrashIcon className="w-4 h-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
