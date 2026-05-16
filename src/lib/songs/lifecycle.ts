/**
 * Song lifecycle transitions.
 *
 * The single seam for moving a Song row between generationStatus values.
 * Owns the cross-cutting invariants — most importantly:
 *
 *   - Transitioning TO `ready` clears `archivedAt` + `errorMessage`.
 *   - Transitioning TO `failed` auto-archives, preserving any user-set
 *     archivedAt so a manual archive is never silently overwritten.
 *   - Transitioning TO `pending` for a retry resets pollCount and clears
 *     archivedAt + errorMessage so the row reappears in the library
 *     while regenerating.
 *
 * Use the transition constants when you're already building a richer
 * update payload (e.g. handleSongSuccess writing audio/image URLs).
 * Use the helper functions for sites that only need the lifecycle
 * mutation itself.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const readyTransition = {
  generationStatus: "ready",
  errorMessage: null,
  archivedAt: null,
} as const satisfies Prisma.SongUpdateInput;

export const pendingRetryTransition = {
  generationStatus: "pending",
  errorMessage: null,
  pollCount: 0,
  archivedAt: null,
} as const satisfies Prisma.SongUpdateInput;

/**
 * Build the field-deltas for a failure transition.
 *
 * Reads the song's current archivedAt and preserves it if non-null —
 * a user may have archived the song manually before it failed; we
 * shouldn't overwrite that. Otherwise sets archivedAt = now.
 */
export async function buildFailedTransition(
  songId: string,
  errorMessage: string,
): Promise<Prisma.SongUpdateInput> {
  const existing = await prisma.song.findUnique({
    where: { id: songId },
    select: { archivedAt: true },
  });
  return {
    generationStatus: "failed",
    errorMessage,
    archivedAt: existing?.archivedAt ?? new Date(),
  };
}

/**
 * Mark a song failed without any side-effects (broadcasts, queue
 * resolution, error logging). For routes that detect a terminal
 * failure condition outside the polling loop — e.g. "No Suno task
 * ID" — and need the row marked failed in DB.
 *
 * For polling-driven failures with side-effects use handleSongFailure
 * in generation/song-completion.ts instead.
 */
export async function markSongFailedSimple(
  songId: string,
  errorMessage: string,
): Promise<void> {
  const data = await buildFailedTransition(songId, errorMessage);
  await prisma.song.update({ where: { id: songId }, data });
}

/**
 * Flip a previously-failed song back to pending with a fresh Suno
 * task ID. Used by the retry route after a successful generateSong()
 * call. Clears archivedAt + errorMessage + pollCount so the row
 * reappears in the library and the polling cycle starts clean.
 */
export async function markSongPendingRetry(
  songId: string,
  sunoJobId: string,
): Promise<void> {
  await prisma.song.update({
    where: { id: songId },
    data: { sunoJobId, ...pendingRetryTransition },
  });
}

/**
 * Flip a previously-failed song straight to ready, without an actual
 * regeneration. Used by the retry route's no-api-key branch which
 * cannot call Suno; clearing the failure state is the best we can do.
 * pollCount is reset so the row looks fresh.
 */
export async function markSongReadyNoApi(songId: string): Promise<void> {
  await prisma.song.update({
    where: { id: songId },
    data: { ...readyTransition, pollCount: 0 },
  });
}
