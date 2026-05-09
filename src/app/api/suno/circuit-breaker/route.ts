import { NextResponse } from "next/server";
import { getCircuitStatus, resetCircuit } from "@/lib/circuit-breaker";
import { resolveUser } from "@/lib/auth";

/** GET /api/suno/circuit-breaker — return current circuit state (public to authenticated users). */
export async function GET(request: Request) {
  const { error: authError } = await resolveUser(request);
  if (authError) return authError;

  return NextResponse.json(getCircuitStatus());
}

/** POST /api/suno/circuit-breaker/reset — admin-only force-reset. */
export async function POST(request: Request) {
  const { isAdmin, error: authError } = await resolveUser(request);
  if (authError) return authError;

  if (!isAdmin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  resetCircuit();
  return NextResponse.json({ ok: true, status: getCircuitStatus() });
}
