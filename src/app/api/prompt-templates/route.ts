import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
import { listTemplates, createTemplate } from "@/lib/prompt-templates";

export const GET = authRoute(async (request, { auth }) => {
  const { searchParams } = new URL(request.url);
  return resultResponse(await listTemplates(auth.userId, {
    category: searchParams.get("category"),
    search: searchParams.get("search"),
  }));
}, { route: "/api/prompt-templates" });

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const result = await createTemplate(auth.userId, body);
  if (!result.ok) return resultResponse(result);
  return NextResponse.json({ template: result.data }, { status: 201 });
}, { route: "/api/prompt-templates" });
