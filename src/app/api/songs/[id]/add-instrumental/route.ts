import { authRoute, resultResponse } from "@/lib/route-handler";
import { respondToGeneration } from "@/lib/generation";
import { addInstrumental } from "@/lib/songs";
import {
  addInstrumentalBody,
  type AddInstrumentalBody,
} from "@/lib/songs/variations/schemas";

export const POST = authRoute<{ id: string }, AddInstrumentalBody>(async (_request, { auth, params, body }) => {
  const result = await addInstrumental(auth.userId, params.id, {
    tags: body.tags,
    title: body.title,
  });
  if (!result.ok) return resultResponse(result);

  return respondToGeneration(result.data, {
    label: "add-instrumental-api",
    userId: auth.userId,
    route: `/api/songs/${params.id}/add-instrumental`,
  });
}, { body: addInstrumentalBody });
