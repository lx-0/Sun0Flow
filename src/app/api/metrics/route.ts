/**
 * APM metrics endpoint (admin-only).
 *
 * Returns a JSON snapshot of all in-process metrics:
 *   - per-route request counts, error rates, and latency percentiles
 *   - generation queue depth and processing time percentiles
 *
 * Protected behind admin auth — not exposed to regular users.
 */
import { NextResponse } from "next/server";
import { adminRoute } from "@/lib/route-handler";
import { getMetricsSnapshot } from "@/lib/metrics";

export const GET = adminRoute(async () => {
  return NextResponse.json(getMetricsSnapshot());
}, { route: "/api/metrics" });
