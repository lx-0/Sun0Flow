"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  PlayIcon,
  PauseIcon,
  MusicalNoteIcon,
  TrashIcon,
  ArrowLeftIcon,
  Bars3Icon,
  PencilIcon,
  ShareIcon,
  ClipboardDocumentIcon,
  GlobeAltIcon,
  LockClosedIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon as PlaySolidIcon } from "@heroicons/react/24/solid";
import type { Song } from "@prisma/client";
import { useToast } from "./Toast";
import { useQueue, type QueueSong } from "./QueueContext";
import { SwipeablePlaylistItem } from "./SwipeablePlaylistItem";
import { BottomSheet } from "./BottomSheet";

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
    lyrics: song.lyrics,
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
  isPublic: boolean;
  slug: string | null;
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

  // Share state
  const [isPublic, setIsPublic] = useState(initialPlaylist.isPublic);
  const [slug, setSlug] = useState(initialPlaylist.slug);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [isTogglingShare, setIsTogglingShare] = useState(false);

  // Drag state (mouse/pointer)
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  // Touch drag refs (to avoid stale closures in document listeners)
  const touchDragActive = useRef(false);
  const touchDragFrom = useRef<number | null>(null);
  const touchDragTo = useRef<number | null>(null);
  const touchCurrentSongs = useRef(songs);
  useEffect(() => {
    touchCurrentSongs.current = songs;
  }, [songs]);

  // Document-level touch handlers for drag reorder
  useEffect(() => {
    function onTouchMove(e: TouchEvent) {
      if (!touchDragActive.current) return;
      e.preventDefault();
      const touch = e.touches[0];
      let target: Element | null = document.elementFromPoint(touch.clientX, touch.clientY);
      while (target && !target.hasAttribute("data-drag-index")) {
        target = target.parentElement;
      }
      if (target) {
        const idx = parseInt(target.getAttribute("data-drag-index") ?? "-1", 10);
        if (idx >= 0 && idx !== touchDragTo.current) {
          touchDragTo.current = idx;
          setDragOverIndex(idx);
        }
      }
    }

    function onTouchEnd() {
      if (!touchDragActive.current) return;
      touchDragActive.current = false;
      const from = touchDragFrom.current;
      const to = touchDragTo.current;
      touchDragFrom.current = null;
      touchDragTo.current = null;
      setDragIndex(null);
      setDragOverIndex(null);
      if (from === null || to === null || from === to) return;
      const prev = touchCurrentSongs.current;
      const reordered = [...prev];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      setSongs(reordered);
      fetch(`/api/playlists/${playlist.id}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songIds: reordered.map((ps) => ps.songId) }),
      }).then((res) => {
        if (!res.ok) {
          setSongs(prev);
          toast("Failed to reorder", "error");
        }
      }).catch(() => {
        setSongs(prev);
        toast("Failed to reorder", "error");
      });
    }

    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    return () => {
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
    };
  }, [playlist.id, toast]);

  function handleDragHandleTouchStart(index: number) {
    touchDragActive.current = true;
    touchDragFrom.current = index;
    touchDragTo.current = index;
    setDragIndex(index);
    setDragOverIndex(index);
  }

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

  async function handleToggleShare() {
    if (isTogglingShare) return;
    setIsTogglingShare(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/share`, {
        method: "PATCH",
      });
      if (!res.ok) {
        toast("Failed to update sharing", "error");
        return;
      }
      const data = await res.json();
      setIsPublic(data.isPublic);
      setSlug(data.slug);
      toast(data.isPublic ? "Playlist is now public" : "Playlist is now private", "success");
    } catch {
      toast("Failed to update sharing", "error");
    } finally {
      setIsTogglingShare(false);
    }
  }

  function handleCopyLink() {
    if (!slug) return;
    const url = `${window.location.origin}/p/${slug}`;
    navigator.clipboard.writeText(url).then(() => toast("Link copied!", "success"));
  }

  function handleCopyEmbed() {
    if (!slug) return;
    const url = `${window.location.origin}/embed/playlist/${slug}`;
    const code = `<iframe src="${url}" width="400" height="500" frameborder="0" allow="autoplay"></iframe>`;
    navigator.clipboard.writeText(code).then(() => toast("Embed code copied!", "success"));
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
            aria-label="Playlist name"
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            maxLength={100}
            autoFocus
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <input
            type="text"
            aria-label="Playlist description"
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
              onClick={() => setShowSharePanel((v) => !v)}
              aria-label="Share playlist"
              aria-expanded={showSharePanel}
              className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                isPublic
                  ? "text-violet-500 dark:text-violet-400 hover:text-violet-600"
                  : "text-gray-400 dark:text-gray-500 hover:text-violet-400"
              }`}
            >
              <ShareIcon className="w-5 h-5" />
            </button>
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

      {/* Share panel */}
      {showSharePanel && !editing && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          {/* Toggle public/private */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              {isPublic ? (
                <GlobeAltIcon className="w-4 h-4 text-violet-500" />
              ) : (
                <LockClosedIcon className="w-4 h-4 text-gray-400 dark:text-gray-500" />
              )}
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {isPublic ? "Public playlist" : "Private playlist"}
              </span>
            </div>
            <button
              onClick={handleToggleShare}
              disabled={isTogglingShare}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 disabled:opacity-50 ${
                isPublic ? "bg-violet-600" : "bg-gray-400 dark:bg-gray-600"
              }`}
              role="switch"
              aria-checked={isPublic}
              aria-label="Toggle playlist visibility"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isPublic ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Share link — only shown when public */}
          {isPublic && slug && (
            <>
              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Share link</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    aria-label="Share link"
                    value={`${typeof window !== "undefined" ? window.location.origin : ""}/p/${slug}`}
                    className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
                  />
                  <button
                    onClick={handleCopyLink}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors whitespace-nowrap"
                  >
                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Embed code</p>
                <div className="flex gap-2">
                  <input
                    readOnly
                    aria-label="Embed code"
                    value={`<iframe src="${typeof window !== "undefined" ? window.location.origin : ""}/embed/playlist/${slug}" width="400" height="500" frameborder="0" allow="autoplay"></iframe>`}
                    className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 focus:outline-none font-mono"
                  />
                  <button
                    onClick={handleCopyEmbed}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors whitespace-nowrap"
                  >
                    <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              </div>
            </>
          )}
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

      {/* Delete confirmation — bottom sheet on mobile, dialog on desktop */}
      <BottomSheet
        open={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Delete playlist"
      >
        <div className="space-y-3">
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
      </BottomSheet>

      {/* Song list */}
      {songs.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
          <MusicalNoteIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-700 mb-3" aria-hidden="true" />
          <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-1">No songs yet</h3>
          <p className="text-gray-500 dark:text-gray-400 text-sm mb-4">
            Add songs to this playlist from your library.
          </p>
          <Link
            href="/library"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-500 text-white text-sm font-medium rounded-xl transition-colors"
          >
            Browse your library
          </Link>
        </div>
      ) : (
        <ul className="space-y-1">
          {songs.map((ps, index) => {
            const isActive = currentSongId === ps.songId;
            const hasAudio = Boolean(ps.song.audioUrl);
            const isDragOver = dragOverIndex === index;

            return (
              <SwipeablePlaylistItem
                key={ps.id}
                onSwipeRemove={() => handleRemoveSong(ps.songId)}
              >
                <li
                  data-drag-index={index}
                  draggable
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDrop={(e) => handleDrop(e, index)}
                  onDragEnd={() => {
                    setDragIndex(null);
                    setDragOverIndex(null);
                  }}
                  className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2.5 rounded-xl transition-colors ${
                    isActive
                      ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-300 dark:border-violet-700"
                      : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
                  } ${isDragOver ? "border-violet-400 dark:border-violet-500" : ""} ${
                    dragIndex === index ? "opacity-50" : ""
                  }`}
                >
                  {/* Drag handle */}
                  <div
                    className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center touch-none"
                    onTouchStart={() => handleDragHandleTouchStart(index)}
                  >
                    <Bars3Icon className="w-5 h-5" />
                  </div>

                  {/* Position number — hidden on very narrow screens */}
                  <span className="flex-shrink-0 w-6 text-xs text-gray-400 dark:text-gray-500 text-center hidden sm:block">
                    {index + 1}
                  </span>

                  {/* Cover art */}
                  <div className="relative flex-shrink-0 w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
                    {ps.song.imageUrl ? (
                      <Image
                        src={ps.song.imageUrl}
                        alt={ps.song.title ?? "Song"}
                        fill
                        className="object-cover"
                        sizes="40px"
                        loading="lazy"
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

                  {/* Play button — larger touch target */}
                  <button
                    onClick={() => handleTogglePlay(ps.song)}
                    disabled={!hasAudio}
                    aria-label={
                      isActive && isPlaying ? "Pause" : "Play"
                    }
                    className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                      hasAudio
                        ? "bg-violet-600 hover:bg-violet-500 text-white"
                        : "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
                    }`}
                  >
                    {isActive && isPlaying ? (
                      <PauseIcon className="w-5 h-5" />
                    ) : (
                      <PlayIcon className="w-5 h-5 ml-0.5" />
                    )}
                  </button>

                  {/* Remove button — hidden on mobile (use swipe instead) */}
                  <button
                    onClick={() => handleRemoveSong(ps.songId)}
                    aria-label="Remove from playlist"
                    className="flex-shrink-0 w-11 h-11 rounded-full hidden sm:flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
                  >
                    <TrashIcon className="w-4 h-4" />
                  </button>
                </li>
              </SwipeablePlaylistItem>
            );
          })}
        </ul>
      )}
    </div>
  );
}
