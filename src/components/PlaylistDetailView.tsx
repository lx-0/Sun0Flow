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
  QueueListIcon,
  ForwardIcon,
  ArrowDownTrayIcon,
  XMarkIcon,
  UserGroupIcon,
  UserPlusIcon,
  LinkIcon,
} from "@heroicons/react/24/outline";
import { PlayIcon as PlaySolidIcon, CheckIcon } from "@heroicons/react/24/solid";
import { exportAsZip } from "@/lib/export";
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

interface CollaboratorUser {
  id: string;
  name: string | null;
  image: string | null;
  avatarUrl: string | null;
}

interface PlaylistSongItem {
  id: string;
  songId: string;
  position: number;
  song: Song;
  addedByUser: CollaboratorUser | null;
}

interface PlaylistCollaboratorItem {
  id: string;
  userId: string | null;
  status: string;
  user: CollaboratorUser | null;
}

interface PlaylistData {
  id: string;
  name: string;
  description: string | null;
  isPublic: boolean;
  isCollaborative: boolean;
  slug: string | null;
  songs: PlaylistSongItem[];
  _count: { songs: number };
  collaborators: PlaylistCollaboratorItem[];
}

interface SongListItemProps {
  ps: PlaylistSongItem;
  index: number;
  isActive: boolean;
  hasAudio: boolean;
  isDragOver: boolean;
  dragIndex: number | null;
  isSelected: boolean;
  selectionMode: boolean;
  isPlaying: boolean;
  isCollaborative: boolean;
  onDragStart: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDragHandleTouchStart: () => void;
  onKeyboardReorder: (direction: "up" | "down") => void;
  isFirst: boolean;
  isLast: boolean;
  onTogglePlay: () => void;
  onPlayNext: () => void;
  onAddToQueue: () => void;
  onRemove: () => void;
  onToggleSelect: () => void;
  onLongPress: () => void;
}

function SongListItem({
  ps, index, isActive, hasAudio, isDragOver, dragIndex, isSelected, selectionMode, isPlaying, isCollaborative,
  onDragStart, onDragOver, onDrop, onDragEnd, onDragHandleTouchStart, onKeyboardReorder, isFirst, isLast,
  onTogglePlay, onPlayNext, onAddToQueue, onRemove, onToggleSelect, onLongPress,
}: SongListItemProps) {
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);

  function handleTouchStart(e: React.TouchEvent) {
    // Don't trigger long-press from drag handle touches
    const target = e.target as HTMLElement;
    if (target.closest("[data-drag-handle]")) return;
    const t = e.touches[0];
    touchStartPos.current = { x: t.clientX, y: t.clientY };
    longPressTimer.current = setTimeout(() => { onLongPress(); }, 500);
  }
  function handleTouchMove(e: React.TouchEvent) {
    if (!touchStartPos.current || !longPressTimer.current) return;
    const t = e.touches[0];
    if (Math.abs(t.clientX - touchStartPos.current.x) > 10 || Math.abs(t.clientY - touchStartPos.current.y) > 10) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }
  function handleTouchEnd() {
    if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null; }
    touchStartPos.current = null;
  }

  return (
    <li
      data-drag-index={index}
      draggable={!selectionMode}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchEnd}
      className={`flex items-center gap-2 sm:gap-3 px-2 sm:px-3 py-2.5 rounded-xl transition-colors ${
        isSelected
          ? "border border-violet-500 bg-violet-50 dark:bg-violet-950/30"
          : isActive
            ? "bg-violet-50 dark:bg-violet-900/20 border border-violet-300 dark:border-violet-700"
            : "bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800"
      } ${isDragOver && !selectionMode ? "border-violet-400 dark:border-violet-500" : ""} ${
        dragIndex === index ? "opacity-50" : ""
      }`}
    >
      {/* Selection checkbox (selection mode) or drag handle (normal mode) */}
      {selectionMode ? (
        <button
          onClick={onToggleSelect}
          aria-label={isSelected ? "Deselect song" : "Select song"}
          className={`flex-shrink-0 w-6 h-6 rounded border-2 flex items-center justify-center transition-all ${
            isSelected ? "bg-violet-600 border-violet-600 text-white" : "border-gray-300 dark:border-gray-600 hover:border-violet-400"
          }`}
        >
          {isSelected && <CheckIcon className="w-4 h-4" />}
        </button>
      ) : (
        <div
          data-drag-handle
          tabIndex={0}
          role="button"
          aria-label={`Reorder ${ps.song.title ?? "song"}. Press arrow keys to move up or down.`}
          aria-disabled={isFirst && isLast}
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-gray-300 dark:text-gray-600 min-w-[44px] min-h-[44px] flex items-center justify-center touch-none focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-500 rounded"
          onTouchStart={onDragHandleTouchStart}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") { e.preventDefault(); onKeyboardReorder("up"); }
            else if (e.key === "ArrowDown") { e.preventDefault(); onKeyboardReorder("down"); }
          }}
        >
          <Bars3Icon className="w-5 h-5" />
        </div>
      )}

      {/* Position number — hidden on very narrow screens */}
      <span className="flex-shrink-0 w-6 text-xs text-gray-400 dark:text-gray-500 text-center hidden sm:block">
        {index + 1}
      </span>

      {/* Cover art */}
      <div className="relative flex-shrink-0 w-10 h-10 rounded-lg bg-gray-200 dark:bg-gray-800 overflow-hidden flex items-center justify-center">
        {ps.song.imageUrl ? (
          <Image src={ps.song.imageUrl} alt={ps.song.title ?? "Song"} fill className="object-cover" sizes="40px" loading="lazy" />
        ) : (
          <MusicalNoteIcon className="w-5 h-5 text-gray-400 dark:text-gray-600" />
        )}
      </div>

      {/* Title + duration + attribution */}
      <div className="flex-1 min-w-0">
        <Link
          href={`/library/${ps.songId}`}
          className="block text-sm font-medium text-gray-900 dark:text-white truncate hover:text-violet-400 transition-colors"
        >
          {ps.song.title ?? "Untitled"}
        </Link>
        <div className="flex items-center gap-1.5">
          {ps.song.duration && (
            <span className="text-xs text-gray-400 dark:text-gray-500">{formatTime(ps.song.duration)}</span>
          )}
          {isCollaborative && ps.addedByUser?.name && (
            <span className="text-xs text-gray-400 dark:text-gray-500 truncate">
              · {ps.addedByUser.name}
            </span>
          )}
        </div>
      </div>

      {/* Play button */}
      <button
        onClick={onTogglePlay}
        disabled={!hasAudio}
        aria-label={isActive && isPlaying ? "Pause" : "Play"}
        className={`flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
          hasAudio
            ? "bg-violet-600 hover:bg-violet-500 text-white"
            : "bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed"
        }`}
      >
        {isActive && isPlaying ? <PauseIcon className="w-5 h-5" /> : <PlayIcon className="w-5 h-5 ml-0.5" />}
      </button>

      {/* Play Next / Add to Queue — hidden on mobile, hidden in selection mode */}
      {hasAudio && !selectionMode && (
        <div className="hidden sm:flex items-center gap-0.5">
          <button
            onClick={onPlayNext}
            aria-label={`Play ${ps.song.title ?? "song"} next`}
            title="Play Next"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-violet-400 transition-colors"
          >
            <ForwardIcon className="w-4 h-4" />
          </button>
          <button
            onClick={onAddToQueue}
            aria-label={`Add ${ps.song.title ?? "song"} to queue`}
            title="Add to Queue"
            className="flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-violet-400 transition-colors"
          >
            <QueueListIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Remove button — hidden on mobile, hidden in selection mode */}
      {!selectionMode && (
        <button
          onClick={onRemove}
          aria-label="Remove from playlist"
          className="flex-shrink-0 w-11 h-11 rounded-full hidden sm:flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      )}
    </li>
  );
}

export function PlaylistDetailView({
  playlist: initialPlaylist,
  isOwner = true,
}: {
  playlist: PlaylistData;
  isOwner?: boolean;
}) {
  const { toast } = useToast();
  const router = useRouter();
  const {
    queue,
    currentIndex,
    isPlaying,
    togglePlay,
    playQueue,
    playNext,
    addToQueue,
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

  // Collaborative state
  const [isCollaborative, setIsCollaborative] = useState(initialPlaylist.isCollaborative);
  const [collaborators, setCollaborators] = useState<PlaylistCollaboratorItem[]>(
    initialPlaylist.collaborators ?? []
  );
  const [showCollabPanel, setShowCollabPanel] = useState(false);
  const [isTogglingCollab, setIsTogglingCollab] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);

  // Batch selection state
  const [selectedSongIds, setSelectedSongIds] = useState<Set<string>>(new Set());
  const selectionMode = selectedSongIds.size > 0;
  const [batchLoading, setBatchLoading] = useState(false);
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false);
  const [batchDownloading, setBatchDownloading] = useState(false);
  const [batchDownloadProgress, setBatchDownloadProgress] = useState<{ completed: number; total: number } | null>(null);

  function handleToggleSelect(songId: string) {
    setSelectedSongIds((prev) => {
      const next = new Set(prev);
      if (next.has(songId)) next.delete(songId); else next.add(songId);
      return next;
    });
  }
  function handleSelectAll() {
    if (selectedSongIds.size === songs.length) {
      setSelectedSongIds(new Set());
    } else {
      setSelectedSongIds(new Set(songs.map((ps) => ps.songId)));
    }
  }

  async function handleBatchRemoveFromPlaylist() {
    if (batchLoading || selectedSongIds.size === 0) return;
    setBatchLoading(true);
    const idsToRemove = Array.from(selectedSongIds);
    // Optimistic update
    setSongs((prev) => prev.filter((ps) => !selectedSongIds.has(ps.songId)));
    setSelectedSongIds(new Set());
    setShowBatchDeleteConfirm(false);
    try {
      await Promise.all(
        idsToRemove.map((songId) =>
          fetch(`/api/playlists/${playlist.id}/songs/${songId}`, { method: "DELETE" })
        )
      );
      toast(`Removed ${idsToRemove.length} song${idsToRemove.length !== 1 ? "s" : ""} from playlist`, "success");
    } catch {
      toast("Failed to remove some songs", "error");
    } finally {
      setBatchLoading(false);
    }
  }

  async function handleBatchDownload() {
    if (batchDownloading || selectedSongIds.size === 0) return;
    const selectedSongs = songs
      .filter((ps) => selectedSongIds.has(ps.songId) && ps.song.audioUrl)
      .map((ps) => ({ ...ps.song, audioUrl: ps.song.audioUrl! }));
    if (selectedSongs.length === 0) {
      toast("No downloadable songs selected", "error");
      return;
    }
    setBatchDownloading(true);
    setBatchDownloadProgress({ completed: 0, total: selectedSongs.length });
    try {
      await exportAsZip(selectedSongs, (completed, total) => {
        setBatchDownloadProgress({ completed, total });
      });
      toast(`Downloaded ${selectedSongs.length} song${selectedSongs.length !== 1 ? "s" : ""} as ZIP`, "success");
    } catch {
      toast("Download failed", "error");
    } finally {
      setBatchDownloading(false);
      setBatchDownloadProgress(null);
    }
  }

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

  async function handleKeyboardReorder(index: number, direction: "up" | "down") {
    const newIndex = direction === "up" ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= songs.length) return;
    const prev = [...songs];
    const reordered = [...songs];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(newIndex, 0, moved);
    setSongs(reordered);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/reorder`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ songIds: reordered.map((ps) => ps.songId) }),
      });
      if (!res.ok) {
        setSongs(prev);
        toast("Failed to reorder", "error");
      }
    } catch {
      setSongs(prev);
      toast("Failed to reorder", "error");
    }
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
    playQueue(queueSongs, idx >= 0 ? idx : 0, playlist.name);
  }

  function handlePlayAll() {
    const queueSongs = buildPlaylistQueue();
    if (queueSongs.length > 0) {
      playQueue(queueSongs, 0, playlist.name);
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

  async function handleToggleCollaborative() {
    if (isTogglingCollab) return;
    setIsTogglingCollab(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/collaborative`, { method: "PATCH" });
      if (!res.ok) { toast("Failed to update collaborative mode", "error"); return; }
      const data = await res.json();
      setIsCollaborative(data.isCollaborative);
      if (!data.isCollaborative) setInviteLink(null);
      toast(data.isCollaborative ? "Collaborative mode enabled" : "Collaborative mode disabled", "success");
    } catch {
      toast("Failed to update collaborative mode", "error");
    } finally {
      setIsTogglingCollab(false);
    }
  }

  async function handleGenerateInvite() {
    if (isGeneratingInvite) return;
    setIsGeneratingInvite(true);
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/collaborators`, { method: "POST" });
      if (!res.ok) { toast("Failed to generate invite link", "error"); return; }
      const data = await res.json();
      const link = `${window.location.origin}/playlists/invite/${data.collaborator.inviteToken}`;
      setInviteLink(link);
    } catch {
      toast("Failed to generate invite link", "error");
    } finally {
      setIsGeneratingInvite(false);
    }
  }

  function handleCopyInviteLink() {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => toast("Invite link copied!", "success"));
  }

  async function handleRemoveCollaborator(collaboratorId: string) {
    try {
      const res = await fetch(`/api/playlists/${playlist.id}/collaborators/${collaboratorId}`, { method: "DELETE" });
      if (!res.ok) { toast("Failed to remove collaborator", "error"); return; }
      setCollaborators((prev) => prev.filter((c) => c.id !== collaboratorId));
      toast("Collaborator removed", "success");
    } catch {
      toast("Failed to remove collaborator", "error");
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
            {songs.length > 0 && (
              <button
                onClick={handleSelectAll}
                className="mt-1 text-xs font-medium text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors"
              >
                {selectedSongIds.size === songs.length ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          <div className="flex items-center gap-1">
            {isOwner && (
              <button
                onClick={() => { setShowCollabPanel((v) => !v); setShowSharePanel(false); }}
                aria-label="Collaborative mode"
                aria-expanded={showCollabPanel}
                className={`w-11 h-11 rounded-full flex items-center justify-center transition-colors ${
                  isCollaborative
                    ? "text-violet-500 dark:text-violet-400 hover:text-violet-600"
                    : "text-gray-400 dark:text-gray-500 hover:text-violet-400"
                }`}
              >
                <UserGroupIcon className="w-5 h-5" />
              </button>
            )}
            <button
              onClick={() => { setShowSharePanel((v) => !v); setShowCollabPanel(false); }}
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
            {isOwner && (
              <>
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
              </>
            )}
          </div>
        </div>
      )}

      {/* Collaborator avatars */}
      {isCollaborative && collaborators.filter((c) => c.user).length > 0 && !editing && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500 dark:text-gray-400">Collaborators:</span>
          <div className="flex -space-x-2">
            {collaborators.filter((c) => c.user).slice(0, 5).map((c) => (
              <div
                key={c.id}
                title={c.user?.name ?? "Collaborator"}
                className="w-7 h-7 rounded-full bg-violet-200 dark:bg-violet-800 border-2 border-white dark:border-gray-900 overflow-hidden flex items-center justify-center text-xs font-medium text-violet-700 dark:text-violet-300 flex-shrink-0"
              >
                {(c.user?.avatarUrl ?? c.user?.image) ? (
                  <Image
                    src={(c.user?.avatarUrl ?? c.user?.image)!}
                    alt={c.user?.name ?? "Collaborator"}
                    width={28}
                    height={28}
                    className="object-cover w-full h-full"
                  />
                ) : (
                  (c.user?.name?.[0] ?? "?").toUpperCase()
                )}
              </div>
            ))}
            {collaborators.filter((c) => c.user).length > 5 && (
              <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-700 border-2 border-white dark:border-gray-900 flex items-center justify-center text-xs font-medium text-gray-600 dark:text-gray-300">
                +{collaborators.filter((c) => c.user).length - 5}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Collaborative panel (owner only) */}
      {showCollabPanel && isOwner && !editing && (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-3">
          {/* Toggle collaborative */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <UserGroupIcon className={`w-4 h-4 ${isCollaborative ? "text-violet-500" : "text-gray-400 dark:text-gray-500"}`} />
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {isCollaborative ? "Collaborative mode on" : "Collaborative mode off"}
              </span>
            </div>
            <button
              onClick={handleToggleCollaborative}
              disabled={isTogglingCollab}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-2 focus:ring-offset-white dark:focus:ring-offset-gray-900 disabled:opacity-50 ${
                isCollaborative ? "bg-violet-600" : "bg-gray-400 dark:bg-gray-600"
              }`}
              role="switch"
              aria-checked={isCollaborative}
              aria-label="Toggle collaborative mode"
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  isCollaborative ? "translate-x-6" : "translate-x-1"
                }`}
              />
            </button>
          </div>

          {/* Invite link — only shown when collaborative */}
          {isCollaborative && (
            <div className="space-y-2">
              <button
                onClick={handleGenerateInvite}
                disabled={isGeneratingInvite}
                className="flex items-center gap-2 text-sm font-medium text-violet-600 dark:text-violet-400 hover:text-violet-500 transition-colors disabled:opacity-50"
              >
                <UserPlusIcon className="w-4 h-4" />
                {isGeneratingInvite ? "Generating…" : "Generate invite link"}
              </button>

              {inviteLink && (
                <div className="flex gap-2">
                  <input
                    readOnly
                    aria-label="Invite link"
                    value={inviteLink}
                    className="flex-1 bg-gray-50 dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-lg px-3 py-2 text-xs text-gray-700 dark:text-gray-300 focus:outline-none"
                  />
                  <button
                    onClick={handleCopyInviteLink}
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/30 transition-colors whitespace-nowrap"
                  >
                    <LinkIcon className="w-3.5 h-3.5" />
                    Copy
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Collaborator list */}
          {isCollaborative && collaborators.filter((c) => c.user).length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-gray-500 dark:text-gray-400">Current collaborators</p>
              {collaborators.filter((c) => c.user).map((c) => (
                <div key={c.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full bg-violet-100 dark:bg-violet-900 flex items-center justify-center text-xs font-medium text-violet-700 dark:text-violet-300 overflow-hidden flex-shrink-0">
                      {(c.user?.avatarUrl ?? c.user?.image) ? (
                        <Image
                          src={(c.user?.avatarUrl ?? c.user?.image)!}
                          alt={c.user?.name ?? ""}
                          width={28}
                          height={28}
                          className="object-cover w-full h-full"
                        />
                      ) : (
                        (c.user?.name?.[0] ?? "?").toUpperCase()
                      )}
                    </div>
                    <span className="text-sm text-gray-900 dark:text-white">{c.user?.name ?? "Unknown"}</span>
                  </div>
                  <button
                    onClick={() => handleRemoveCollaborator(c.id)}
                    aria-label={`Remove ${c.user?.name ?? "collaborator"}`}
                    className="text-xs text-red-500 hover:text-red-600 transition-colors"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
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
        <ul className={`space-y-1 ${selectionMode ? "pb-20" : ""}`}>
          {songs.map((ps, index) => {
            const isActive = currentSongId === ps.songId;
            const hasAudio = Boolean(ps.song.audioUrl);
            const isDragOver = dragOverIndex === index;
            const isSelected = selectedSongIds.has(ps.songId);

            return (
              <SwipeablePlaylistItem
                key={ps.id}
                onSwipeRemove={selectionMode ? () => {} : () => handleRemoveSong(ps.songId)}
              >
                <SongListItem
                  ps={ps}
                  index={index}
                  isActive={isActive}
                  hasAudio={hasAudio}
                  isDragOver={isDragOver}
                  dragIndex={dragIndex}
                  isSelected={isSelected}
                  selectionMode={selectionMode}
                  isPlaying={isPlaying}
                  isCollaborative={isCollaborative}
                  onDragStart={() => handleDragStart(index)}
                  onDragOver={(e: React.DragEvent) => handleDragOver(e, index)}
                  onDrop={(e: React.DragEvent) => handleDrop(e, index)}
                  onDragEnd={() => { setDragIndex(null); setDragOverIndex(null); }}
                  onDragHandleTouchStart={() => handleDragHandleTouchStart(index)}
                  onKeyboardReorder={(dir) => handleKeyboardReorder(index, dir)}
                  isFirst={index === 0}
                  isLast={index === songs.length - 1}
                  onTogglePlay={() => handleTogglePlay(ps.song)}
                  onPlayNext={() => { const qs = songToQueueSong(ps.song); if (qs) playNext(qs); }}
                  onAddToQueue={() => { const qs = songToQueueSong(ps.song); if (qs) addToQueue(qs); }}
                  onRemove={() => handleRemoveSong(ps.songId)}
                  onToggleSelect={() => handleToggleSelect(ps.songId)}
                  onLongPress={() => setSelectedSongIds(new Set([ps.songId]))}
                />
              </SwipeablePlaylistItem>
            );
          })}
        </ul>
      )}

      {/* Batch toolbar */}
      {selectionMode && (
        <div className="fixed bottom-20 md:bottom-4 left-2 right-2 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 z-40 flex items-center gap-2 px-4 py-3 bg-gray-900 dark:bg-gray-800 text-white rounded-2xl shadow-2xl border border-gray-700 animate-slide-in">
          <span className="text-sm font-medium mr-1 flex-shrink-0">
            {selectedSongIds.size} selected
          </span>
          <button
            onClick={handleBatchDownload}
            disabled={batchDownloading}
            aria-label="Download selected songs as ZIP"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-gray-700 hover:bg-gray-600 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            <span className="hidden sm:inline">
              {batchDownloading && batchDownloadProgress
                ? `${batchDownloadProgress.completed}/${batchDownloadProgress.total}`
                : "Download"}
            </span>
          </button>
          <button
            onClick={() => setShowBatchDeleteConfirm(true)}
            disabled={batchLoading}
            aria-label="Remove selected from playlist"
            className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-red-600 hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
          >
            <TrashIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Remove</span>
          </button>
          <button
            onClick={() => setSelectedSongIds(new Set())}
            aria-label="Clear selection"
            className="flex-shrink-0 flex items-center justify-center w-9 h-9 rounded-lg text-gray-400 hover:text-white hover:bg-gray-700 transition-colors"
          >
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Batch delete confirmation */}
      {showBatchDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-remove-dialog-title"
          onKeyDown={(e) => { if (e.key === "Escape") setShowBatchDeleteConfirm(false); }}
        >
          <div className="bg-white dark:bg-gray-900 w-full sm:rounded-2xl rounded-t-2xl shadow-2xl border border-gray-200 dark:border-gray-700 p-6 sm:mx-4 sm:max-w-sm">
            <h3 id="batch-remove-dialog-title" className="text-lg font-semibold text-gray-900 dark:text-white">
              Remove {selectedSongIds.size} song{selectedSongIds.size !== 1 ? "s" : ""} from playlist?
            </h3>
            <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
              The songs will remain in your library.
            </p>
            <div className="mt-4 flex gap-3 justify-end">
              <button
                onClick={() => setShowBatchDeleteConfirm(false)}
                disabled={batchLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 text-gray-900 dark:text-white hover:bg-gray-300 dark:hover:bg-gray-700 transition-colors min-h-[44px]"
              >
                Cancel
              </button>
              <button
                onClick={handleBatchRemoveFromPlaylist}
                disabled={batchLoading}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-red-600 text-white hover:bg-red-500 disabled:opacity-50 transition-colors min-h-[44px]"
              >
                {batchLoading ? "Removing…" : "Remove"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
