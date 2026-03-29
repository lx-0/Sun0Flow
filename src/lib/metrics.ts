/**
 * In-process APM metrics.
 *
 * Tracks per-route request latency (p50/p95/p99), error counts, and
 * generation queue/processing time. Metrics are exported as JSON to stdout
 * on demand (via /api/metrics) and periodically flushed to the logger.
 *
 * All state lives in globalThis so it survives Next.js HMR without reset.
 */
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RouteStats {
  /** Total request count */
  requests: number;
  /** Total error count (4xx + 5xx responses) */
  errors: number;
  /** Sorted latency samples (ms). We keep at most MAX_SAMPLES per route. */
  latencySamples: number[];
}

interface GenerationStats {
  /** Total generations started */
  total: number;
  /** Total generations completed */
  completed: number;
  /** Total generations failed */
  failed: number;
  /** Processing time samples (ms) */
  processingTimeSamples: number[];
  /** Current queue depth (active generations in flight) */
  queueDepth: number;
  /** ISO timestamp of the last successful generation, null if none since startup */
  lastCompletedAt: string | null;
}

interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

interface MetricsSnapshot {
  capturedAt: string;
  routes: Record<
    string,
    {
      requests: number;
      errors: number;
      errorRate: number;
      latency: { p50: number; p95: number; p99: number } | null;
    }
  >;
  generation: {
    total: number;
    completed: number;
    failed: number;
    queueDepth: number;
    lastCompletedAt: string | null;
    processingTime: { p50: number; p95: number; p99: number } | null;
  };
  cache: CacheStats;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const MAX_SAMPLES = 1000;

interface CacheCounters {
  hits: number;
  misses: number;
}

const globalForMetrics = globalThis as unknown as {
  __appMetrics:
    | {
        routes: Map<string, RouteStats>;
        generation: GenerationStats;
        cache: CacheCounters;
        resetAt: string;
      }
    | undefined;
};

function initMetrics() {
  return {
    routes: new Map<string, RouteStats>(),
    generation: {
      total: 0,
      completed: 0,
      failed: 0,
      processingTimeSamples: [] as number[],
      queueDepth: 0,
      lastCompletedAt: null,
    } satisfies GenerationStats,
    cache: { hits: 0, misses: 0 } satisfies CacheCounters,
    resetAt: new Date().toISOString(),
  };
}

// Persist across HMR in development
if (!globalForMetrics.__appMetrics) {
  globalForMetrics.__appMetrics = initMetrics();
}

const state = globalForMetrics.__appMetrics!;

// ---------------------------------------------------------------------------
// Percentile helper
// ---------------------------------------------------------------------------

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(idx, sorted.length - 1))];
}

function insertSorted(arr: number[], value: number, max: number): void {
  // Binary-search insertion to keep array sorted
  let lo = 0;
  let hi = arr.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if (arr[mid] < value) lo = mid + 1;
    else hi = mid;
  }
  arr.splice(lo, 0, value);
  if (arr.length > max) arr.shift(); // drop oldest/smallest
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a completed HTTP request.
 *
 * @param route   Normalised route string, e.g. "/api/songs"
 * @param latencyMs  Wall-clock time from first byte to response send
 * @param statusCode HTTP response status code
 */
export function recordRequest(
  route: string,
  latencyMs: number,
  statusCode: number
): void {
  let stats = state.routes.get(route);
  if (!stats) {
    stats = { requests: 0, errors: 0, latencySamples: [] };
    state.routes.set(route, stats);
  }
  stats.requests++;
  if (statusCode >= 400) stats.errors++;
  insertSorted(stats.latencySamples, latencyMs, MAX_SAMPLES);
}

/**
 * Record a cache hit for monitoring.
 */
export function recordCacheHit(): void {
  state.cache.hits++;
}

/**
 * Record a cache miss for monitoring.
 */
export function recordCacheMiss(): void {
  state.cache.misses++;
}

/**
 * Mark a generation as started (increments queue depth).
 */
export function recordGenerationStart(): void {
  state.generation.total++;
  state.generation.queueDepth++;
}

/**
 * Mark a generation as finished.
 *
 * @param processingMs  Total wall-clock time for the generation
 * @param success       Whether the generation succeeded
 */
export function recordGenerationEnd(
  processingMs: number,
  success: boolean
): void {
  state.generation.queueDepth = Math.max(0, state.generation.queueDepth - 1);
  if (success) {
    state.generation.completed++;
    state.generation.lastCompletedAt = new Date().toISOString();
  } else {
    state.generation.failed++;
  }
  insertSorted(
    state.generation.processingTimeSamples,
    processingMs,
    MAX_SAMPLES
  );
}

/**
 * Return a point-in-time snapshot of all metrics.
 */
export function getMetricsSnapshot(): MetricsSnapshot {
  const routes: MetricsSnapshot["routes"] = {};

  state.routes.forEach((stats, route) => {
    const sorted = stats.latencySamples;
    routes[route] = {
      requests: stats.requests,
      errors: stats.errors,
      errorRate:
        stats.requests > 0
          ? Math.round((stats.errors / stats.requests) * 10000) / 100
          : 0,
      latency:
        sorted.length > 0
          ? {
              p50: percentile(sorted, 50),
              p95: percentile(sorted, 95),
              p99: percentile(sorted, 99),
            }
          : null,
    };
  });

  const gen = state.generation;
  const genSorted = gen.processingTimeSamples;

  const total = state.cache.hits + state.cache.misses;

  return {
    capturedAt: new Date().toISOString(),
    routes,
    generation: {
      total: gen.total,
      completed: gen.completed,
      failed: gen.failed,
      queueDepth: gen.queueDepth,
      lastCompletedAt: gen.lastCompletedAt,
      processingTime:
        genSorted.length > 0
          ? {
              p50: percentile(genSorted, 50),
              p95: percentile(genSorted, 95),
              p99: percentile(genSorted, 99),
            }
          : null,
    },
    cache: {
      hits: state.cache.hits,
      misses: state.cache.misses,
      hitRate: total > 0 ? Math.round((state.cache.hits / total) * 10000) / 100 : 0,
    },
  };
}

// ---------------------------------------------------------------------------
// Periodic stdout export
// ---------------------------------------------------------------------------

const FLUSH_INTERVAL_MS = 60_000; // export to stdout every 60 s

let flushTimer: ReturnType<typeof setInterval> | null = null;

function startFlushTimer() {
  if (flushTimer) return;
  flushTimer = setInterval(() => {
    const snapshot = getMetricsSnapshot();
    logger.info({ metrics: snapshot }, "apm-metrics-flush");
  }, FLUSH_INTERVAL_MS);

  // Don't keep the process alive for this alone
  flushTimer.unref?.();
}

// Only start the timer server-side (not during Next.js static generation)
if (typeof window === "undefined") {
  startFlushTimer();
}
