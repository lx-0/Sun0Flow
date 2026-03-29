/**
 * Background job scheduler.
 *
 * Wraps node-cron with a job registry, per-run execution logging, and
 * graceful shutdown. All state lives in globalThis so it survives Next.js
 * HMR without losing history.
 *
 * Usage:
 *   import { registerJob, startScheduler, stopScheduler } from "@/lib/scheduler";
 *
 *   registerJob("my-job", "0 * * * *", async () => { ... });
 *   await startScheduler();
 *
 * Health data:
 *   import { getSchedulerStatus } from "@/lib/scheduler";
 *   const status = getSchedulerStatus(); // used by /api/health
 */

import { schedule, type ScheduledTask } from "node-cron";
import { logger } from "@/lib/logger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface JobRunRecord {
  startedAt: Date;
  finishedAt?: Date;
  durationMs?: number;
  success: boolean;
  error?: string;
}

export interface JobStatus {
  name: string;
  schedule: string;
  lastRun?: JobRunRecord;
  nextRun?: string | null;
  running: boolean;
}

interface JobEntry {
  name: string;
  expression: string;
  handler: () => Promise<void> | void;
  task?: ScheduledTask;
  lastRun?: JobRunRecord;
  running: boolean;
}

// ---------------------------------------------------------------------------
// Global state (survives HMR)
// ---------------------------------------------------------------------------

declare global {
  // eslint-disable-next-line no-var
  var __scheduler: {
    jobs: Map<string, JobEntry>;
    started: boolean;
  };
}

function getState() {
  if (!globalThis.__scheduler) {
    globalThis.__scheduler = { jobs: new Map(), started: false };
  }
  return globalThis.__scheduler;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Register a job. Safe to call before startScheduler().
 * Re-registering the same name is a no-op if the scheduler is already started.
 */
export function registerJob(
  name: string,
  cronExpression: string,
  handler: () => Promise<void> | void
): void {
  const state = getState();
  if (state.jobs.has(name)) return;
  state.jobs.set(name, { name, expression: cronExpression, handler, running: false });
}

/** Start all registered jobs. Idempotent. */
export async function startScheduler(): Promise<void> {
  const state = getState();
  if (state.started) return;
  state.started = true;

  for (const entry of state.jobs.values()) {
    entry.task = schedule(
      entry.expression,
      async () => {
        await runJob(entry);
      },
      { timezone: "UTC" }
    );
  }

  logger.info({ jobs: [...state.jobs.keys()] }, "scheduler: started");
}

/**
 * Stop all jobs gracefully. Waits for any in-progress run to finish (up to
 * timeoutMs) before forcibly stopping.
 */
export async function stopScheduler(timeoutMs = 30_000): Promise<void> {
  const state = getState();
  if (!state.started) return;

  // Stop accepting new invocations immediately
  for (const entry of state.jobs.values()) {
    await entry.task?.stop();
  }

  // Wait for in-progress jobs
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const anyRunning = [...state.jobs.values()].some((e) => e.running);
    if (!anyRunning) break;
    await new Promise((r) => setTimeout(r, 200));
  }

  state.started = false;
  logger.info("scheduler: stopped");
}

/** Return a snapshot of all job statuses for health / monitoring. */
export function getSchedulerStatus(): JobStatus[] {
  const state = getState();
  return [...state.jobs.values()].map((entry) => ({
    name: entry.name,
    schedule: entry.expression,
    lastRun: entry.lastRun,
    nextRun: entry.task ? entry.task.getNextRun()?.toISOString() ?? null : null,
    running: entry.running,
  }));
}

// ---------------------------------------------------------------------------
// Internal
// ---------------------------------------------------------------------------

async function runJob(entry: JobEntry): Promise<void> {
  if (entry.running) {
    logger.warn({ job: entry.name }, "scheduler: skipping overlapping run");
    return;
  }

  entry.running = true;
  const startedAt = new Date();
  logger.info({ job: entry.name }, "scheduler: job started");

  try {
    await entry.handler();
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    entry.lastRun = { startedAt, finishedAt, durationMs, success: true };
    logger.info({ job: entry.name, durationMs }, "scheduler: job completed");
  } catch (err) {
    const finishedAt = new Date();
    const durationMs = finishedAt.getTime() - startedAt.getTime();
    const error = err instanceof Error ? err.message : String(err);
    entry.lastRun = { startedAt, finishedAt, durationMs, success: false, error };
    logger.error({ job: entry.name, durationMs, err }, "scheduler: job failed");
    // Do NOT rethrow — failed jobs must not crash the process
  } finally {
    entry.running = false;
  }
}
