"use client";

import { useState } from "react";
import Link from "next/link";
import {
  PlusIcon,
  MusicalNoteIcon,
  TrashIcon,
  QueueListIcon,
} from "@heroicons/react/24/outline";
import { useToast } from "./Toast";

interface PlaylistItem {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  _count: { songs: number };
}

export function PlaylistsView({
  playlists: initialPlaylists,
}: {
  playlists: PlaylistItem[];
}) {
  const { toast } = useToast();
  const [playlists, setPlaylists] = useState(initialPlaylists);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [creating, setCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim() || creating) return;

    setCreating(true);
    try {
      const res = await fetch("/api/playlists", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newName.trim(),
          description: newDesc.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        toast(data.error || "Failed to create playlist", "error");
        return;
      }

      const data = await res.json();
      setPlaylists((prev) => [data.playlist, ...prev]);
      setNewName("");
      setNewDesc("");
      setShowCreate(false);
      toast("Playlist created", "success");
    } catch {
      toast("Failed to create playlist", "error");
    } finally {
      setCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setConfirmDeleteId(null);
    setDeletingId(id);
    try {
      const res = await fetch(`/api/playlists/${id}`, { method: "DELETE" });
      if (!res.ok) {
        toast("Failed to delete playlist", "error");
        return;
      }
      setPlaylists((prev) => prev.filter((p) => p.id !== id));
      toast("Playlist deleted", "success");
    } catch {
      toast("Failed to delete playlist", "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Playlists
          </h1>
          <span className="text-gray-500 dark:text-gray-400 text-sm">
            {playlists.length} playlist{playlists.length !== 1 ? "s" : ""}
          </span>
        </div>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors min-h-[44px]"
        >
          <PlusIcon className="w-4 h-4" />
          New
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-4 space-y-3"
        >
          <input
            type="text"
            placeholder="Playlist name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            maxLength={100}
            autoFocus
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <input
            type="text"
            placeholder="Description (optional)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-4 py-3 text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={!newName.trim() || creating}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-50 min-h-[44px]"
            >
              {creating ? "Creating…" : "Create"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="px-4 py-2.5 rounded-lg text-sm font-medium bg-gray-200 dark:bg-gray-800 hover:bg-gray-300 dark:hover:bg-gray-700 text-gray-900 dark:text-white transition-colors min-h-[44px]"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Playlist list */}
      {playlists.length === 0 ? (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl p-8 text-center">
          <QueueListIcon className="w-10 h-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-gray-500 text-sm">
            No playlists yet. Create one to organize your songs.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {playlists.map((pl) => (
            <li
              key={pl.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-xl overflow-hidden transition-colors hover:border-violet-400 dark:hover:border-violet-600"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                {/* Icon */}
                <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                  <MusicalNoteIcon className="w-6 h-6 text-violet-500" />
                </div>

                {/* Name + meta */}
                <Link
                  href={`/playlists/${pl.id}`}
                  className="flex-1 min-w-0"
                >
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate hover:text-violet-400 transition-colors">
                    {pl.name}
                  </p>
                  {pl.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      {pl.description}
                    </p>
                  )}
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                    {pl._count.songs} song{pl._count.songs !== 1 ? "s" : ""}
                  </p>
                </Link>

                {/* Delete button with confirmation */}
                {confirmDeleteId === pl.id ? (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleDelete(pl.id)}
                      disabled={deletingId === pl.id}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-red-600 hover:bg-red-500 text-white transition-colors disabled:opacity-50"
                    >
                      {deletingId === pl.id ? "…" : "Delete"}
                    </button>
                    <button
                      onClick={() => setConfirmDeleteId(null)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-gray-200 dark:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmDeleteId(pl.id)}
                    disabled={deletingId === pl.id}
                    aria-label="Delete playlist"
                    className="flex-shrink-0 w-11 h-11 rounded-full flex items-center justify-center text-gray-400 dark:text-gray-500 hover:text-red-500 transition-colors disabled:opacity-50"
                  >
                    <TrashIcon className="w-5 h-5" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
