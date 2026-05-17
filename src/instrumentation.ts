/**
 * Next.js instrumentation hook.
 *
 * Runs once when the server starts (not per-request). Used to:
 *   1. Initialize Sentry/GlitchTip per runtime (nodejs vs edge)
 *   2. Start the background job scheduler
 *   3. Register a SIGTERM handler for graceful shutdown
 *
 * Docs:
 *   https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 *   https://docs.sentry.io/platforms/javascript/guides/nextjs/
 */

export async function register() {
  // Sentry server/edge runtime init. The dedicated config files only invoke
  // Sentry.init() when their DSN env var is set, so this is a no-op when
  // tracking is disabled. Without these imports, sentry.server.config.ts is
  // never executed and 100% of server-side errors silently bypass Sentry.
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("../sentry.server.config");
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("../sentry.edge.config");
  }

  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerAllJobs } = await import("@/lib/jobs");
  const { startScheduler, stopScheduler } = await import("@/lib/scheduler");

  registerAllJobs();
  await startScheduler();

  // Import the warmup module directly — routing through the @/lib/cache
  // barrel drags `@/lib/cache/file` (which uses Node-only `fs`/`stream`)
  // into the edge-runtime bundle of instrumentation.ts and fails the build.
  const { warmUpAudioCache } = await import("@/lib/cache/warmup");
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

// Required for Next.js 15 to forward RSC + route-handler errors into Sentry.
// Without this export, server-side React errors and unhandled exceptions
// from Route Handlers are not captured even when Sentry.init has run.
export { captureRequestError as onRequestError } from "@sentry/nextjs";
