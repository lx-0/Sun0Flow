/**
 * Next.js instrumentation hook.
 *
 * Runs once when the server starts (not per-request). Used to:
 *   1. Start the background job scheduler
 *   2. Register a SIGTERM handler for graceful shutdown
 *
 * Docs: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerAllJobs } = await import("@/lib/jobs");
  const { startScheduler, stopScheduler } = await import("@/lib/scheduler");

  registerAllJobs();
  await startScheduler();

  const { warmUpAudioCache } = await import("@/lib/cache");
  const { logger } = await import("@/lib/logger");
  warmUpAudioCache().catch((err) => {
    logger.error({ err }, "cache-warmup: startup warmup failed");
  });

  const proc = globalThis.process;
  proc.once("SIGTERM", async () => {
    await stopScheduler(30_000);
    proc.exit(0);
  });
}
