import { NextResponse } from "next/server";
import { authRoute, resultResponse } from "@/lib/route-handler";
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
  return resultResponse(result, { status: 201 });
}, {
  route: "/api/style-templates",
  body: createTemplateSchema,
});
