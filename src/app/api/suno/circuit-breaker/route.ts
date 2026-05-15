import { NextResponse } from "next/server";
import { getCircuitStatus, resetCircuit } from "@/lib/circuit-breaker";
import { authRoute, adminRoute } from "@/lib/route-handler";

/** GET /api/suno/circuit-breaker — return current circuit state (public to authenticated users). */
export const GET = authRoute(async () => {
  return NextResponse.json(getCircuitStatus());
}, { route: "/api/suno/circuit-breaker" });

/** POST /api/suno/circuit-breaker/reset — admin-only force-reset. */
export const POST = adminRoute(async () => {
  resetCircuit();
  return NextResponse.json({ ok: true, status: getCircuitStatus() });
}, { route: "/api/suno/circuit-breaker" });
