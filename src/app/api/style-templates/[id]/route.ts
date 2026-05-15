import { authRoute, resultResponse } from "@/lib/route-handler";
import {
  deleteStyleTemplate,
  type PatchTemplateInput,
  patchTemplateSchema,
  updateStyleTemplate,
} from "@/lib/style-templates";

export const PATCH = authRoute<{ id: string }, PatchTemplateInput>(async (_request, { auth, params, body }) => {
  const result = await updateStyleTemplate(auth.userId, params.id, body);
  return resultResponse(result);
}, {
  route: "/api/style-templates/[id]",
  body: patchTemplateSchema,
});

export const DELETE = authRoute<{ id: string }>(async (_request, { auth, params }) => {
  const result = await deleteStyleTemplate(auth.userId, params.id);
  return resultResponse(result);
}, {
  route: "/api/style-templates/[id]",
});
