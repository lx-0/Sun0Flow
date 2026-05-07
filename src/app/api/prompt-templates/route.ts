import { NextResponse } from "next/server";
import { authRoute } from "@/lib/route-handler";
import { listTemplates, createTemplate } from "@/lib/prompt-templates";

export const GET = authRoute(async (request, { auth }) => {
  const { searchParams } = new URL(request.url);
  const result = await listTemplates(auth.userId, {
    category: searchParams.get("category"),
    search: searchParams.get("search"),
  });
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json(result.data);
}, { route: "/api/prompt-templates" });

export const POST = authRoute(async (request, { auth }) => {
  const body = await request.json();
  const result = await createTemplate(auth.userId, body);
  if (!result.ok)
    return NextResponse.json(
      { error: result.error, code: result.code },
      { status: result.status },
    );
  return NextResponse.json({ template: result.data }, { status: 201 });
}, { route: "/api/prompt-templates" });
