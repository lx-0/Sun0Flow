/**
 * Request timing instrumentation for Next.js App Router route handlers.
 *
 * Wraps a handler to:
 *   - Record wall-clock latency via recordRequest() for APM metrics
 *   - Add X-Response-Time header to every response
 *   - Emit a warning log for requests exceeding SLOW_REQUEST_THRESHOLD_MS
 */
import { NextRequest } from "next/server";
import { recordRequest } from "@/lib/metrics";
import { logger } from "@/lib/logger";

/** Log a warning for any request slower than this (ms). */
const SLOW_REQUEST_THRESHOLD_MS = 500;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyArgs = any[];
type Handler<A extends AnyArgs> = (req: NextRequest, ...args: A) => Promise<Response>;

/**
 * Wrap a Next.js App Router route handler with request timing.
 *
 * Usage:
 *   export const GET = withTiming("/api/discover", async (request) => { ... });
 *   export const GET = withTiming("/api/users/[id]", async (request, { params }) => { ... });
 *
 * @param route     Normalised route name logged to APM (e.g. "/api/discover")
 * @param handler   The original route handler function
 */
export function withTiming<A extends AnyArgs>(
  route: string,
  handler: Handler<A>
): Handler<A> {
  return async function timed(req: NextRequest, ...args: A): Promise<Response> {
    const start = performance.now();
    let status = 500;
    try {
      const response = await handler(req, ...args);
      status = response.status;
      const latencyMs = Math.round(performance.now() - start);
      recordRequest(route, latencyMs, status);
      if (latencyMs > SLOW_REQUEST_THRESHOLD_MS) {
        logger.warn({ route, latencyMs, status }, "slow-api-request");
      }
      response.headers.set("X-Response-Time", `${latencyMs}ms`);
      return response;
    } catch (err) {
      const latencyMs = Math.round(performance.now() - start);
      recordRequest(route, latencyMs, status);
      throw err;
    }
  };
}
