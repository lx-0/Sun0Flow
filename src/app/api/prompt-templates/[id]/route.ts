import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { updateTemplate, deleteTemplate } from "@/lib/prompt-templates";

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  const result = await updateTemplate(auth.userId, params.id, body);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ template: result.data });
}, { route: "/api/prompt-templates/[id]" });

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  return resultResponse(await deleteTemplate(auth.userId, params.id));
}, { route: "/api/prompt-templates/[id]" });
