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
  // Only run in the Node.js server runtime, not in Edge or during client builds.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { registerAllJobs } = await import("@/lib/jobs");
  const { startScheduler, stopScheduler } = await import("@/lib/scheduler");

  registerAllJobs();
  await startScheduler();

  // Graceful shutdown: wait for in-progress jobs before exiting
  process.once("SIGTERM", async () => {
    await stopScheduler(30_000);
    process.exit(0);
  });
}
