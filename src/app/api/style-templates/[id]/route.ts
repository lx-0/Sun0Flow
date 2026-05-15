import { NextResponse } from "next/server";
import { badRequest, notFound } from "@/lib/api-error";
import { authRoute } from "@/lib/route-handler";
import {
  deleteStyleTemplate,
  type PatchTemplateInput,
  patchTemplateSchema,
  updateStyleTemplate,
} from "@/lib/style-templates";

export const PATCH = authRoute<{ id: string }, PatchTemplateInput>(async (_request, { auth, params, body }) => {
  const result = await updateStyleTemplate(auth.userId, params.id, body);
  if (!result.ok) {
    if (result.status === 404) return notFound(result.error);
    return badRequest(result.error);
  }
  return NextResponse.json(result.data);
}, {
  route: "/api/style-templates/[id]",
  body: patchTemplateSchema,
});

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await deleteStyleTemplate(auth.userId, params.id);
  if (!result.ok) {
    return notFound(result.error);
  }
  return NextResponse.json(result.data);
}, {
  route: "/api/style-templates/[id]",
});
