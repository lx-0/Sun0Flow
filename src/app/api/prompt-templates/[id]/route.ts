import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { updateTemplate, deleteTemplate } from "@/lib/prompt-templates";

export const PATCH = authRoute<{ id: string }>(async (request, { auth, params }) => {
  const body = await request.json();
  const result = await updateTemplate(auth.userId, params.id, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json({ template: result.data });
}, { route: "/api/prompt-templates/[id]" });

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await deleteTemplate(auth.userId, params.id);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}, { route: "/api/prompt-templates/[id]" });
