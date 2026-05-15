"use client";

import { track } from "@/lib/analytics";
import { getIsVisible, subscribeVisibility } from "./visibility";

export type GenerationStatus = "pending" | "processing" | "ready" | "failed";

export interface GenerationState {
  songId: string;
  status: GenerationStatus;
  title: string | null;
  errorMessage: string | null;
}

type Listener = (songs: GenerationState[]) => void;

const POLL_INTERVAL_MS = 4000;
const MAX_POLLS = 60;

// ── Singleton state ────────────────────────────────────────────────────────
// Lives at module scope so tracking survives component remounts (e.g. when
// the user navigates away from GenerateForm but generation continues
// server-side). All consuming hooks subscribe to the same state.

const songs = new Map<string, GenerationState>();
const eventSources = new Map<string, EventSource>();
const intervals = new Map<string, ReturnType<typeof setInterval>>();
const pollCounts = new Map<string, number>();
const listeners = new Set<Listener>();
let visibilityBound = false;

function hasWindow(): boolean {
  return typeof window !== "undefined" && typeof EventSource !== "undefined";
}

function snapshot(): GenerationState[] {
  return Array.from(songs.values());
}

function notify() {
  const snap = snapshot();
  for (const l of listeners) l(snap);
}

function updateSong(
  songId: string,
  status: GenerationStatus,
  title?: string | null,
  errorMessage?: string | null
) {
  const prev = songs.get(songId);
  if (!prev) return;
  songs.set(songId, {
    ...prev,
    status,
    title: title ?? prev.title,
    errorMessage: errorMessage ?? null,
  });

  if (status === "ready") {
    track("song_generation_completed");
    teardown(songId);
  } else if (status === "failed") {
    teardown(songId);
  }
  notify();
}

// ── Polling fallback ───────────────────────────────────────────────────────

async function pollSong(songId: string): Promise<void> {
  if (!getIsVisible()) return;

  const count = (pollCounts.get(songId) ?? 0) + 1;
  pollCounts.set(songId, count);

  if (count > MAX_POLLS) {
    updateSong(songId, "failed", null, "Generation timed out");
    return;
  }

  try {
    const res = await fetch(`/api/songs/${songId}/status`);
    if (!res.ok) return;
    const data = await res.json();
    const info = data.song ?? data;
    const newStatus: GenerationStatus =
      info.generationStatus === "ready"
        ? "ready"
        : info.generationStatus === "failed"
          ? "failed"
          : info.pollCount > 0
            ? "processing"
            : "pending";
    updateSong(songId, newStatus, info.title, info.errorMessage);
  } catch {
    // Network error — keep polling
  }
}

function startPollingFallback(songId: string): void {
  if (intervals.has(songId)) return;
  pollCounts.set(songId, 0);
  const interval = setInterval(() => pollSong(songId), POLL_INTERVAL_MS);
  intervals.set(songId, interval);
  pollSong(songId);
}

function stopPolling(songId: string): void {
  const interval = intervals.get(songId);
  if (interval) {
    clearInterval(interval);
    intervals.delete(songId);
  }
  pollCounts.delete(songId);
}

// ── SSE per-song stream ────────────────────────────────────────────────────
// One EventSource per tracked song id, regardless of how many components
// observe it. Closed on visibility=hidden and reopened on resume so mobile
// browsers don't keep idle connections in the background.

function openSSE(songId: string): void {
  if (!hasWindow()) return;
  if (eventSources.has(songId)) return;
  if (!getIsVisible()) return;

  const es = new EventSource(`/api/generate/${songId}/stream`);
  eventSources.set(songId, es);

  es.addEventListener("generation_update", (e: MessageEvent) => {
    try {
      const data = JSON.parse(e.data);
      if (data.songId !== songId) return;
      const status: GenerationStatus =
        data.status === "ready"
          ? "ready"
          : data.status === "failed"
            ? "failed"
            : "processing";
      updateSong(songId, status, data.title, data.errorMessage);
    } catch {
      // Invalid JSON — ignore
    }
  });

  es.onerror = () => {
    closeSSE(songId);
    startPollingFallback(songId);
  };
}

function closeSSE(songId: string): void {
  const es = eventSources.get(songId);
  if (es) {
    es.close();
    eventSources.delete(songId);
  }
}

function teardown(songId: string): void {
  closeSSE(songId);
  stopPolling(songId);
}

// ── Visibility coordination ────────────────────────────────────────────────

function bindVisibility(): void {
  if (visibilityBound || !hasWindow()) return;
  visibilityBound = true;
  subscribeVisibility((visible) => {
    if (!visible) {
      // Pause network: close all SSE connections, keep state.
      for (const songId of Array.from(eventSources.keys())) closeSSE(songId);
    } else {
      // Resume: reopen SSE for any song still in non-terminal state.
      for (const [songId, state] of songs) {
        if (state.status !== "ready" && state.status !== "failed") {
          openSSE(songId);
        }
      }
    }
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

export function trackSong(songId: string, title: string | null): void {
  if (!songId) return;
  bindVisibility();
  if (songs.has(songId)) return;
  songs.set(songId, { songId, status: "pending", title, errorMessage: null });
  notify();
  openSSE(songId);
}

export function clearAll(): void {
  for (const songId of Array.from(eventSources.keys())) closeSSE(songId);
  for (const songId of Array.from(intervals.keys())) stopPolling(songId);
  songs.clear();
  pollCounts.clear();
  notify();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  // Push current snapshot immediately so consumers don't wait for the next
  // event to render initial state.
  listener(snapshot());
  return () => {
    listeners.delete(listener);
  };
}

export function isAnySSEConnected(): boolean {
  return eventSources.size > 0;
}

/** Test-only reset. */
export function __resetGenerationTrackerForTests(): void {
  for (const songId of Array.from(eventSources.keys())) closeSSE(songId);
  for (const songId of Array.from(intervals.keys())) stopPolling(songId);
  songs.clear();
  pollCounts.clear();
  listeners.clear();
}
