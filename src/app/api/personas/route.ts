import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { listPersonas, createPersona } from "@/lib/personas";

export const GET = authRoute(async (_request, { auth }) => {
  const result = await listPersonas(auth.userId);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ personas: result.data });
}, { route: "/api/personas" });

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const result = await createPersona(auth.userId, body);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ persona: result.data }, { status: 201 });
}, { route: "/api/personas" });
