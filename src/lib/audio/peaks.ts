"use client";

import { proxiedAudioUrl } from "@/lib/audio-cdn";

const MAX_CACHE_ENTRIES = 50;

interface CacheEntry {
  songId: string;
  peaks: Float32Array;
}

// Tiny LRU: insertion order = age. Bumped on hit by re-inserting.
const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<Float32Array>>();

let workerRef: Worker | null = null;
const pending = new Map<number, (peaks: Float32Array) => void>();
let nextRequestId = 1;

function getWorker(): Worker | null {
  if (typeof window === "undefined" || typeof Worker === "undefined") return null;
  if (workerRef) return workerRef;

  workerRef = new Worker(new URL("./peaks-worker.ts", import.meta.url), {
    type: "module",
  });
  workerRef.addEventListener("message", (e: MessageEvent<{ id: number; peaks: Float32Array }>) => {
    const { id, peaks } = e.data;
    const resolver = pending.get(id);
    if (resolver) {
      pending.delete(id);
      resolver(peaks);
    }
  });
  return workerRef;
}

function runInWorker(samples: Float32Array, numBars: number): Promise<Float32Array> {
  const worker = getWorker();
  const id = nextRequestId++;
  return new Promise<Float32Array>((resolve) => {
    pending.set(id, resolve);
    if (!worker) {
      // SSR or no Worker support — compute synchronously as fallback. Rare.
      resolve(computePeaksSync(samples, numBars));
      pending.delete(id);
      return;
    }
    worker.postMessage({ id, samples, numBars }, [samples.buffer]);
  });
}

function computePeaksSync(samples: Float32Array, numBars: number): Float32Array {
  const blockSize = Math.max(1, Math.floor(samples.length / numBars));
  const peaks = new Float32Array(numBars);
  for (let i = 0; i < numBars; i++) {
    const start = i * blockSize;
    const end = Math.min(start + blockSize, samples.length);
    let max = 0;
    for (let j = start; j < end; j++) {
      const v = Math.abs(samples[j]);
      if (v > max) max = v;
    }
    peaks[i] = max;
  }
  let maxVal = 0.01;
  for (let i = 0; i < peaks.length; i++) if (peaks[i] > maxVal) maxVal = peaks[i];
  for (let i = 0; i < peaks.length; i++) peaks[i] /= maxVal;
  return peaks;
}

function cacheGet(songId: string): Float32Array | null {
  const entry = cache.get(songId);
  if (!entry) return null;
  // Bump LRU position
  cache.delete(songId);
  cache.set(songId, entry);
  return entry.peaks;
}

function cachePut(songId: string, peaks: Float32Array): void {
  cache.set(songId, { songId, peaks });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function decodeChannelData(songId: string): Promise<Float32Array> {
  const url = proxiedAudioUrl(songId);
  const res = await fetch(url);
  const arrayBuffer = await res.arrayBuffer();

  const AudioCtx =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const audioCtx = new AudioCtx();
  try {
    const decoded = await audioCtx.decodeAudioData(arrayBuffer);
    // Copy so we can transfer the buffer to the worker without invalidating
    // the underlying AudioBuffer.
    return new Float32Array(decoded.getChannelData(0));
  } finally {
    audioCtx.close();
  }
}

/**
 * Returns normalised waveform peaks for a song. Decoded once per song,
 * cached LRU. Heavy peak math runs on a Web Worker — main thread stays
 * responsive even when the user swipes through covers.
 */
export async function getPeaks(songId: string, numBars: number): Promise<Float32Array> {
  const cached = cacheGet(songId);
  if (cached) return cached;

  const existing = inflight.get(songId);
  if (existing) return existing;

  const promise = (async () => {
    const samples = await decodeChannelData(songId);
    const peaks = await runInWorker(samples, numBars);
    cachePut(songId, peaks);
    return peaks;
  })().finally(() => {
    inflight.delete(songId);
  });

  inflight.set(songId, promise);
  return promise;
}

/** Test-only reset. */
export function __resetPeaksForTests(): void {
  cache.clear();
  inflight.clear();
  if (workerRef) {
    workerRef.terminate();
    workerRef = null;
  }
  pending.clear();
}
