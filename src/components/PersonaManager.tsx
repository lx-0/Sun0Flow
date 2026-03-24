"use client";

import { useState, useEffect, useCallback } from "react";
import { TrashIcon, UserCircleIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useToast } from "./Toast";

interface Persona {
  id: string;
  personaId: string;
  name: string;
  description: string | null;
  style: string | null;
  sourceSongId: string | null;
  createdAt: string;
}

interface Song {
  id: string;
  title: string | null;
  sunoJobId: string | null;
  generationStatus: string;
  audioUrl: string | null;
  tags: string | null;
  createdAt: string;
}

export function PersonaManager() {
  const { toast } = useToast();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [songs, setSongs] = useState<Song[]>([]);
  const [songsLoading, setSongsLoading] = useState(false);

  // Create form state
  const [selectedSongId, setSelectedSongId] = useState("");
  const [personaName, setPersonaName] = useState("");
  const [personaDescription, setPersonaDescription] = useState("");
  const [personaStyle, setPersonaStyle] = useState("");
  const [vocalStart, setVocalStart] = useState("");
  const [vocalEnd, setVocalEnd] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchPersonas = useCallback(async () => {
    try {
      const res = await fetch("/api/personas");
      if (res.ok) {
        const data = await res.json();
        setPersonas(data.personas);
      }
    } catch {
      toast("Failed to load personas", "error");
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const fetchSongs = useCallback(async () => {
    setSongsLoading(true);
    try {
      const res = await fetch("/api/songs?status=ready&limit=50");
      if (res.ok) {
        const data = await res.json();
        // Only show songs that have a sunoJobId (needed for persona creation)
        const eligible = (data.songs || []).filter(
          (s: Song) => s.sunoJobId && s.generationStatus === "ready"
        );
        setSongs(eligible);
      }
    } catch {
      toast("Failed to load songs", "error");
    } finally {
      setSongsLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    fetchPersonas();
  }, [fetchPersonas]);

  function openCreateForm() {
    setShowCreateForm(true);
    fetchSongs();
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (isCreating) return;

    const song = songs.find((s) => s.id === selectedSongId);
    if (!song?.sunoJobId) {
      toast("Please select a song", "error");
      return;
    }
    if (!personaName.trim()) {
      toast("Please enter a persona name", "error");
      return;
    }

    setIsCreating(true);
    try {
      const res = await fetch("/api/personas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: song.sunoJobId,
          name: personaName.trim(),
          description: personaDescription.trim() || undefined,
          style: personaStyle.trim() || undefined,
          vocalStart: vocalStart ? parseFloat(vocalStart) : undefined,
          vocalEnd: vocalEnd ? parseFloat(vocalEnd) : undefined,
          songId: song.id,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setPersonas((prev) => [data.persona, ...prev]);
        setShowCreateForm(false);
        resetForm();
        toast(`Persona "${data.persona.name}" created!`, "success");
      } else {
        toast(data.error ?? "Failed to create persona", "error");
      }
    } catch {
      toast("Failed to create persona", "error");
    } finally {
      setIsCreating(false);
    }
  }

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/personas/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPersonas((prev) => prev.filter((p) => p.id !== id));
        toast("Persona deleted", "success");
      } else {
        const data = await res.json();
        toast(data.error ?? "Failed to delete persona", "error");
      }
    } catch {
      toast("Failed to delete persona", "error");
    } finally {
      setDeletingId(null);
    }
  }

  function resetForm() {
    setSelectedSongId("");
    setPersonaName("");
    setPersonaDescription("");
    setPersonaStyle("");
    setVocalStart("");
    setVocalEnd("");
  }

  if (loading) {
    return (
      <div className="px-4 py-6">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/3" />
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
          <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded" />
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Personas</h1>
          <p className="text-gray-500 dark:text-gray-400 text-sm mt-0.5">
            Create voice personas from your songs for consistent style
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateForm}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 rounded-xl transition-colors"
        >
          <PlusIcon className="h-4 w-4" />
          New Persona
        </button>
      </div>

      {/* Create Form */}
      {showCreateForm && (
        <form
          onSubmit={handleCreate}
          className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 space-y-4"
        >
          <p className="text-sm font-medium text-gray-900 dark:text-white">
            Create persona from a completed song
          </p>

          {/* Song selector */}
          <div className="space-y-1">
            <label htmlFor="persona-song" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Source song
            </label>
            {songsLoading ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading songs...</div>
            ) : songs.length === 0 ? (
              <div className="text-sm text-gray-500 dark:text-gray-400">
                No eligible songs found. Generate a song first.
              </div>
            ) : (
              <select
                id="persona-song"
                value={selectedSongId}
                onChange={(e) => setSelectedSongId(e.target.value)}
                required
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              >
                <option value="">Select a song...</option>
                {songs.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title || "Untitled"} {s.tags ? `(${s.tags})` : ""}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Name */}
          <div className="space-y-1">
            <label htmlFor="persona-name" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Persona name
            </label>
            <input
              id="persona-name"
              type="text"
              value={personaName}
              onChange={(e) => setPersonaName(e.target.value)}
              placeholder="e.g. Jazz Singer, Rock Voice"
              required
              maxLength={100}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          {/* Description */}
          <div className="space-y-1">
            <label htmlFor="persona-desc" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Description <span className="text-gray-500 dark:text-gray-400">(optional)</span>
            </label>
            <input
              id="persona-desc"
              type="text"
              value={personaDescription}
              onChange={(e) => setPersonaDescription(e.target.value)}
              placeholder="Describe the vocal character"
              maxLength={200}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          {/* Style */}
          <div className="space-y-1">
            <label htmlFor="persona-style" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Style <span className="text-gray-500 dark:text-gray-400">(optional)</span>
            </label>
            <input
              id="persona-style"
              type="text"
              value={personaStyle}
              onChange={(e) => setPersonaStyle(e.target.value)}
              placeholder="e.g. warm baritone, breathy soprano"
              maxLength={200}
              className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
            />
          </div>

          {/* Vocal segment */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label htmlFor="vocal-start" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Vocal start (sec) <span className="text-gray-500 dark:text-gray-400">(opt)</span>
              </label>
              <input
                id="vocal-start"
                type="number"
                step="0.1"
                min="0"
                value={vocalStart}
                onChange={(e) => setVocalStart(e.target.value)}
                placeholder="0"
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
            <div className="space-y-1">
              <label htmlFor="vocal-end" className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Vocal end (sec) <span className="text-gray-500 dark:text-gray-400">(opt)</span>
              </label>
              <input
                id="vocal-end"
                type="number"
                step="0.1"
                min="0"
                value={vocalEnd}
                onChange={(e) => setVocalEnd(e.target.value)}
                placeholder="30"
                className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl px-3 py-2 text-base sm:text-sm text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400">
            Vocal segment must be 10-30 seconds. Leave blank to auto-detect.
          </p>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isCreating || !selectedSongId}
              className="flex-1 px-3 py-2 text-sm font-medium text-white bg-violet-600 hover:bg-violet-500 disabled:opacity-50 rounded-xl transition-colors"
            >
              {isCreating ? "Creating..." : "Create Persona"}
            </button>
            <button
              type="button"
              onClick={() => {
                setShowCreateForm(false);
                resetForm();
              }}
              className="px-3 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Personas List */}
      {personas.length === 0 && !showCreateForm ? (
        <div className="text-center py-12">
          <UserCircleIcon className="h-12 w-12 text-gray-400 dark:text-gray-600 mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No personas yet. Create one from a completed song to reuse its vocal style.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {personas.map((persona) => (
            <div
              key={persona.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl p-4 flex items-start justify-between gap-3"
            >
              <div className="flex items-start gap-3 min-w-0">
                <div className="flex-shrink-0 w-10 h-10 bg-violet-100 dark:bg-violet-900/30 rounded-full flex items-center justify-center">
                  <UserCircleIcon className="h-6 w-6 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {persona.name}
                  </p>
                  {persona.description && (
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5 line-clamp-2">
                      {persona.description}
                    </p>
                  )}
                  <div className="flex items-center gap-2 mt-1.5">
                    {persona.style && (
                      <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-600 dark:text-violet-400">
                        {persona.style}
                      </span>
                    )}
                    <span className="text-[10px] text-gray-400 dark:text-gray-500">
                      {new Date(persona.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(persona.id)}
                disabled={deletingId === persona.id}
                className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 dark:hover:text-red-400 disabled:opacity-50 transition-colors"
                aria-label={`Delete ${persona.name}`}
                title="Delete persona"
              >
                <TrashIcon className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
        {personas.length} / 50 personas
      </p>
    </div>
  );
}
