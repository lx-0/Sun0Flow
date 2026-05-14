import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api-error";
import { authRoute } from "@/lib/route-handler";
import {
  createStyleTemplate,
  createTemplateSchema,
  listStyleTemplates,
} from "@/lib/style-templates";

export const GET = authRoute(async (_request, { auth }) => {
  const templates = await listStyleTemplates(auth.userId);
  return NextResponse.json({ templates });
}, { route: "/api/style-templates" });

export const POST = authRoute(async (_request, { auth, body }) => {
  const result = await createStyleTemplate(auth.userId, body);
  if (!result.ok) {
    if (result.status === 404) return notFound(result.error);
    return badRequest(result.error);
  }
  return NextResponse.json(result.data, { status: 201 });
}, {
  route: "/api/style-templates",
  body: createTemplateSchema,
});
