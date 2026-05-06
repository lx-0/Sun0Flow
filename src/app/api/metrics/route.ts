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
import { requireAdmin } from "@/lib/auth";
import { getMetricsSnapshot } from "@/lib/metrics";

export async function GET() {
  const { error } = await requireAdmin();
  if (error) return error;

  return NextResponse.json(getMetricsSnapshot());
}
